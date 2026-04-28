require('dotenv').config({ path: '.env.instagram-monitor', override: true });

const { runMonitor } = require('./src/monitor');

/**
 * Calculate the Monday/Thursday date window.
 *
 * Monday run  → windowStart = previous Thursday 00:00 UTC
 *               windowEnd   = today 23:59:59 UTC
 * Thursday run → windowStart = previous Monday 00:00 UTC
 *                windowEnd   = today 23:59:59 UTC
 */
function getDateWindow() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun,1=Mon,...,4=Thu

  const startOfToday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));

  const endOfToday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23, 59, 59, 999
  ));

  let daysBack;
  if (dayOfWeek === 1) {
    // Monday → go back to last Thursday (4 days ago)
    daysBack = 4;
  } else if (dayOfWeek === 4) {
    // Thursday → go back to last Monday (3 days ago)
    daysBack = 3;
  } else {
    // Fallback for manual runs on other days — search last 7 days
    console.warn(
      `[index.js] Today is not Monday or Thursday (UTC day=${dayOfWeek}). ` +
      'Defaulting to a 7-day window. Use run-now.js for manual runs.'
    );
    daysBack = 7;
  }

  const windowStart = new Date(startOfToday.getTime() - daysBack * 24 * 60 * 60 * 1000);

  return { windowStart, windowEnd: endOfToday };
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

  const { windowStart, windowEnd } = getDateWindow();

  try {
    await runMonitor({ windowStart, windowEnd, apifyToken, anthropicApiKey, botToken, chatId });
  } catch (err) {
    console.error('[FATAL] Monitor run crashed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
