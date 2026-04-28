const axios = require('axios');

const APIFY_BASE = 'https://api.apify.com/v2';

async function runActor(actorId, input, apiToken) {
  const runRes = await axios.post(
    `${APIFY_BASE}/acts/${actorId}/runs?waitForFinish=300`,
    input,
    {
      headers: { Authorization: `Bearer ${apiToken}` },
      timeout: 360_000,
    }
  );
  const datasetId = runRes.data.data.defaultDatasetId;
  return { datasetId };
}

async function fetchDataset(datasetId, apiToken) {
  const res = await axios.get(
    `${APIFY_BASE}/datasets/${datasetId}/items?clean=true&limit=1000`,
    {
      headers: { Authorization: `Bearer ${apiToken}` },
      timeout: 60_000,
    }
  );
  return res.data;
}

/**
 * Search Google for Instagram posts whose captions contain the keyword phrase.
 * Uses site:instagram.com/p/ + quoted phrase + after: date operator.
 * Returns an array of normalised Instagram post URLs.
 */
async function searchInstagramByCaption(keyword, windowStart, apiToken) {
  const dateStr = windowStart.toISOString().slice(0, 10);
  const query = `site:instagram.com/p/ "${keyword}" after:${dateStr}`;

  const input = {
    queries: query,
    resultsPerPage: 50,
    maxPagesPerQuery: 2,
    languageCode: 'en',
    countryCode: 'us',
  };

  try {
    const { datasetId } = await runActor('apify~google-search-scraper', input, apiToken);
    const pages = await fetchDataset(datasetId, apiToken);

    const postUrls = [];
    for (const page of pages) {
      const organicResults = page.organicResults || [];
      for (const item of organicResults) {
        const raw = item.url || item.link || '';
        const match = raw.match(/instagram\.com\/p\/([A-Za-z0-9_-]+)/);
        if (match) {
          postUrls.push(`https://www.instagram.com/p/${match[1]}/`);
        }
      }
    }
    return postUrls;
  } catch (err) {
    console.error(`[Apify] Google search error for keyword "${keyword}": ${err.message}`);
    return [];
  }
}

/**
 * Batch-scrape Instagram post details for a list of post URLs.
 * Chunked into groups of 50 to stay within actor timeout limits.
 */
async function scrapeInstagramPostDetails(urls, apiToken) {
  if (urls.length === 0) return [];

  const CHUNK_SIZE = 50;
  const allPosts = [];

  for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
    const chunk = urls.slice(i, i + CHUNK_SIZE);
    const input = {
      directUrls: chunk,
      resultsType: 'posts',
      resultsLimit: chunk.length,
    };

    try {
      const { datasetId } = await runActor('apify~instagram-scraper', input, apiToken);
      const posts = await fetchDataset(datasetId, apiToken);
      allPosts.push(...posts);
    } catch (err) {
      console.error(
        `[Apify] Instagram post scrape error (chunk ${Math.floor(i / CHUNK_SIZE) + 1}): ${err.message}`
      );
    }

    if (i + CHUNK_SIZE < urls.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return allPosts;
}

/**
 * Batch-fetch Instagram profiles for a list of usernames.
 * Returns a map of { username -> followerCount }.
 */
async function fetchProfileFollowers(usernames, apiToken) {
  if (usernames.length === 0) return {};

  const input = { usernames };

  try {
    const { datasetId } = await runActor('apify~instagram-profile-scraper', input, apiToken);
    const profiles = await fetchDataset(datasetId, apiToken);

    const followerMap = {};
    for (const profile of profiles) {
      const username = (profile.username || profile.userName || '').toLowerCase();
      const followers =
        profile.followersCount ?? profile.followers ?? profile.followedByCount ?? null;
      if (username && followers !== null) {
        followerMap[username] = followers;
      }
    }
    return followerMap;
  } catch (err) {
    console.error(`[Apify] Error fetching profiles: ${err.message}`);
    return {};
  }
}

module.exports = { searchInstagramByCaption, scrapeInstagramPostDetails, fetchProfileFollowers };
