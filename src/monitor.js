const { searchInstagramByCaption, scrapeInstagramPostDetails, fetchProfileFollowers } = require('./apify');
const { sendResults } = require('./telegram');
const { isCreatorListPost } = require('./classifier');
const KEYWORDS = require('./keywords');

const MIN_FOLLOWERS = 5000;

function normalisePost(item, keyword) {
  const rawUrl = item.url || '';
  const shortCode = item.shortCode || item.shortcode || '';
  const url = rawUrl.includes('instagram.com/p/')
    ? rawUrl.split('?')[0].replace(/\/?$/, '/')
    : shortCode
    ? `https://www.instagram.com/p/${shortCode}/`
    : null;

  const username = (
    item.ownerUsername ||
    item.username ||
    item.owner?.username ||
    ''
  ).toLowerCase();

  const rawDate =
    item.timestamp || item.takenAtTimestamp || item.takenAt || item.date || null;
  const postDate = rawDate ? new Date(rawDate) : null;

  if (!url || !username || !postDate || isNaN(postDate.getTime())) return null;

  return {
    url,
    username,
    postDate,
    caption: item.caption || item.alt || '',
    matchedKeyword: keyword,
    likes: item.likesCount ?? item.likes ?? null,
    comments: item.commentsCount ?? item.comments ?? null,
  };
}

function captionContainsKeyword(caption, keyword) {
  return caption.toLowerCase().includes(keyword.toLowerCase());
}

function captionFingerprint(caption) {
  return caption.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 300);
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

async function runMonitor({ windowStart, windowEnd, apifyToken, anthropicApiKey, botToken, chatId, keywordsOverride }) {
  const keywords = keywordsOverride || KEYWORDS;
  const dateRangeLabel = `${formatDate(windowStart)} → ${formatDate(windowEnd)}`;

  console.log(`\n=== Instagram AI Monitor ===`);
  console.log(`Date window: ${dateRangeLabel}`);
  console.log(`Keywords: ${keywords.length}${keywordsOverride ? ' (test override)' : ''}`);

  // ── Stage 1a: Google search → collect Instagram post URLs ───────────────────
  console.log('\n[Stage 1] Searching Google for Instagram caption matches...');
  const urlToKeyword = new Map();

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    process.stdout.write(`  [${i + 1}/${keywords.length}] "${keyword}" ... `);
    const urls = await searchInstagramByCaption(keyword, windowStart, apifyToken);
    let newCount = 0;
    for (const url of urls) {
      if (!urlToKeyword.has(url)) {
        urlToKeyword.set(url, keyword);
        newCount++;
      }
    }
    console.log(`${urls.length} URLs found, ${newCount} new`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  const allUrls = Array.from(urlToKeyword.keys());
  console.log(`\n[Stage 1] Total unique Instagram URLs: ${allUrls.length}`);

  if (allUrls.length === 0) {
    await sendResults(botToken, chatId, [], dateRangeLabel);
    return;
  }

  // ── Stage 1b: Batch-scrape post details ─────────────────────────────────────
  console.log('[Stage 1] Scraping post details from Instagram...');
  const rawPosts = await scrapeInstagramPostDetails(allUrls, apifyToken);
  console.log(`[Stage 1] Scraped ${rawPosts.length} posts`);

  // ── Stage 1c: Normalise, keyword-check, and caption-dedup ───────────────────
  const candidatePosts = [];
  const captionSeen = new Set();
  let droppedDate = 0, droppedKeyword = 0, droppedDupe = 0;

  for (const raw of rawPosts) {
    const rawUrl = raw.url || '';
    const shortCode = raw.shortCode || raw.shortcode || '';
    const normUrl = rawUrl.includes('instagram.com/p/')
      ? rawUrl.split('?')[0].replace(/\/?$/, '/')
      : shortCode
      ? `https://www.instagram.com/p/${shortCode}/`
      : null;

    const keyword =
      urlToKeyword.get(normUrl) ||
      urlToKeyword.get(normUrl?.replace(/\/$/, '')) ||
      '';

    const post = normalisePost(raw, keyword);
    if (!post) continue;

    if (post.postDate < windowStart || post.postDate > windowEnd) { droppedDate++; continue; }
    if (!captionContainsKeyword(post.caption, keyword)) { droppedKeyword++; continue; }

    const fp = captionFingerprint(post.caption);
    if (captionSeen.has(fp)) { droppedDupe++; continue; }
    captionSeen.add(fp);

    candidatePosts.push(post);
  }

  console.log(`[Stage 1] Candidates after keyword + dedup filters: ${candidatePosts.length}`);
  console.log(`  dropped: ${droppedDate} outside window, ${droppedKeyword} keyword mismatch, ${droppedDupe} duplicate captions`);

  if (candidatePosts.length === 0) {
    await sendResults(botToken, chatId, [], dateRangeLabel);
    return;
  }

  // ── Stage 1d: Claude caption classifier ─────────────────────────────────────
  console.log('\n[Stage 1d] Classifying captions with Claude...');
  const classifiedPosts = [];
  for (const post of candidatePosts) {
    process.stdout.write(`  @${post.username} ... `);
    const isMatch = await isCreatorListPost(post.caption, anthropicApiKey);
    console.log(isMatch ? 'YES' : 'NO');
    if (isMatch) classifiedPosts.push(post);
  }
  console.log(`[Stage 1d] Posts confirmed as creator lists: ${classifiedPosts.length}`);

  if (classifiedPosts.length === 0) {
    await sendResults(botToken, chatId, [], dateRangeLabel);
    return;
  }

  // ── Stage 2: Follower counts ─────────────────────────────────────────────────
  const uniqueUsernames = [...new Set(classifiedPosts.map((p) => p.username))];
  console.log(`\n[Stage 2] Fetching profiles for ${uniqueUsernames.length} unique users...`);

  const followerMap = await fetchProfileFollowers(uniqueUsernames, apifyToken);

  const filteredPosts = classifiedPosts
    .map((post) => ({ ...post, followerCount: followerMap[post.username] ?? 0 }))
    .filter((post) => post.followerCount >= MIN_FOLLOWERS);

  console.log(`[Stage 2] Posts after ≥${MIN_FOLLOWERS.toLocaleString()} followers filter: ${filteredPosts.length}`);

  // ── Stage 3: Sort by follower count ──────────────────────────────────────────
  filteredPosts.sort((a, b) => b.followerCount - a.followerCount);

  // ── Stage 4: Send to Telegram ─────────────────────────────────────────────────
  console.log('\n[Stage 4] Sending to Telegram...');
  await sendResults(botToken, chatId, filteredPosts, dateRangeLabel);
  console.log('[Stage 4] Done.');
}

module.exports = { runMonitor };
