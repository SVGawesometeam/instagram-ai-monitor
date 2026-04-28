const axios = require('axios');

const APIFY_BASE = 'https://api.apify.com/v2';

async function runActor(actorId, input, apiToken, waitSeconds = 300) {
  const runRes = await axios.post(
    `${APIFY_BASE}/acts/${actorId}/runs?waitForFinish=${waitSeconds}`,
    input,
    {
      headers: { Authorization: `Bearer ${apiToken}` },
      timeout: (waitSeconds + 60) * 1000,
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
 * Search Google for all keywords in a single Apify actor run.
 * Returns a Map of { instagram_url -> matched_keyword }.
 */
async function batchSearchInstagramByCaption(keywords, windowStart, apiToken) {
  const dateStr = windowStart.toISOString().slice(0, 10);

  // All queries in one newline-separated string — one actor run instead of N
  const queries = keywords
    .map((k) => `site:instagram.com/p/ "${k}" after:${dateStr}`)
    .join('\n');

  const input = {
    queries,
    resultsPerPage: 15,
    maxPagesPerQuery: 1,
    languageCode: 'en',
    countryCode: 'us',
  };

  try {
    const { datasetId } = await runActor(
      'apify~google-search-scraper',
      input,
      apiToken,
      300
    );
    const pages = await fetchDataset(datasetId, apiToken);

    const urlToKeyword = new Map();

    for (const page of pages) {
      // searchQuery is an object: { term: "site:instagram.com/p/ \"KEYWORD\" after:DATE", ... }
      const queryTerm =
        (typeof page.searchQuery === 'string' ? page.searchQuery : page.searchQuery?.term) || '';
      const keywordMatch = queryTerm.match(/"([^"]+)"/);
      const keyword = keywordMatch ? keywordMatch[1] : '';

      for (const item of page.organicResults || []) {
        const raw = item.url || item.link || '';
        const match = raw.match(/instagram\.com\/p\/([A-Za-z0-9_-]+)/);
        if (match) {
          const url = `https://www.instagram.com/p/${match[1]}/`;
          if (!urlToKeyword.has(url)) urlToKeyword.set(url, keyword);
        }
      }
    }

    return urlToKeyword;
  } catch (err) {
    console.error(`[Apify] Batch Google search error: ${err.message}`);
    return new Map();
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

module.exports = { batchSearchInstagramByCaption, scrapeInstagramPostDetails, fetchProfileFollowers };
