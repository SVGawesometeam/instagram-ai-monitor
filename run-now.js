require('dotenv').config({ path: '.env.instagram-monitor', override: true });

const { runMonitor } = require('./src/monitor');

/**
 * Parse --days N from argv.  Defaults to 7 if not provided.
 */
function parseDaysArg() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--days');
  if (idx !== -1 && args[idx + 1]) {
    const n = parseInt(args[idx + 1], 10);
    if (isNaN(n) || n < 1) {
      console.error('--days must be a positive integer');
      process.exit(1);
    }
    return n;
  }
  return 7;
}

/**
 * Parse --keyword "k1" --keyword "k2" from argv.
 * Returns an array of keywords, or null if flag not used.
 */
function parseKeywordsArg() {
  const args = process.argv.slice(2);
  const keywords = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keyword' && args[i + 1]) {
      keywords.push(args[i + 1]);
      i++;
    }
  }
  return keywords.length > 0 ? keywords : null;
}

async function main() {
  const apifyToken = process.env.APIFY_API_TOKEN;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!apifyToken || !anthropicApiKey || !botToken || !chatId) {
    console.error(
      'Missing required env vars. Set APIFY_API_TOKEN, ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.'
    );
    process.exit(1);
  }

  const days = parseDaysArg();
  const keywordsOverride = parseKeywordsArg();

  if (keywordsOverride) {
    console.log(`Manual run: testing with ${keywordsOverride.length} keyword(s): ${keywordsOverride.map(k => `"${k}"`).join(', ')}`);
  }
  console.log(`Manual run: searching the last ${days} day(s).`);

  const now = new Date();
  const windowEnd = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23, 59, 59, 999
  ));
  const windowStart = new Date(windowEnd.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  windowStart.setUTCHours(0, 0, 0, 0);

  try {
    await runMonitor({ windowStart, windowEnd, apifyToken, anthropicApiKey, botToken, chatId, keywordsOverride });
  } catch (err) {
    console.error('[FATAL] Monitor run crashed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
