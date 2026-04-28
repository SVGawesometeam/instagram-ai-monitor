const axios = require('axios');

const MAX_MESSAGE_LENGTH = 4096;

async function sendTelegramMessage(botToken, chatId, text) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      },
      { timeout: 30_000 }
    );
  } catch (err) {
    console.error('[Telegram] Failed to send message:', err.message);
    console.error('[Telegram] Message content that failed to send:\n', text);
  }
}

/**
 * Split a long text into chunks that fit within Telegram's limit,
 * breaking only at newlines between post blocks.
 */
function splitIntoChunks(text, maxLength = MAX_MESSAGE_LENGTH) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let current = '';

  // Posts are separated by double newline
  const blocks = text.split('\n\n');

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= maxLength) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = block;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/**
 * Send all results to Telegram, splitting into multiple messages if needed.
 */
async function sendResults(botToken, chatId, posts, dateRangeLabel) {
  if (posts.length === 0) {
    const msg = `✅ Instagram scan complete ${dateRangeLabel} — no new posts above 5K followers found.`;
    await sendTelegramMessage(botToken, chatId, msg);
    return;
  }

  const header = `📊 <b>Instagram AI Creator Mentions — ${dateRangeLabel}</b>\n\n`;

  const postLines = posts.map((post) => {
    const followers = post.followerCount.toLocaleString();
    const keyword = post.matchedKeyword || '';
    return [
      `👤 @${post.username} (${followers} followers)`,
      `🔍 Keyword matched: "${keyword}"`,
      `🔗 ${post.url}`,
    ].join('\n');
  });

  const body = postLines.join('\n\n');
  const fullText = header + body;

  const chunks = splitIntoChunks(fullText);

  for (let i = 0; i < chunks.length; i++) {
    await sendTelegramMessage(botToken, chatId, chunks[i]);
    // Brief pause between messages to avoid Telegram rate limits
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

module.exports = { sendResults };
