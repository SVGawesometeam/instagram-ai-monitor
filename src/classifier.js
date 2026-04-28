const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient(apiKey) {
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

const SYSTEM_PROMPT = `You are a content classifier for an Instagram monitoring tool.

Determine whether the given Instagram post caption genuinely contains a list or recommendation of specific AI creators, influencers, or accounts that people should follow.

Answer YES if the post:
- Names or describes specific AI creators, influencers, or accounts (by name, @handle, bold text, bullet points, or any format)
- Recommends specific people to follow in the AI space
- Rounds up or highlights specific AI content creators with identifying details (follower counts, descriptions, niches)

Answer NO if the post:
- Talks about AI in general without listing specific named creators
- Is about AI tools, products, or technology trends (not people to follow)
- Mentions AI influencers as a concept without identifying specific ones
- Is promotional, spam, or unrelated content

Reply with ONLY "YES" or "NO" on the first line, then one short reason on the second line.`;

/**
 * Returns true if the caption genuinely lists or recommends specific AI creators/influencers.
 * On API error, defaults to true (let the post through rather than silently drop it).
 */
async function isCreatorListPost(caption, apiKey) {
  const anthropic = getClient(apiKey);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Caption:\n${caption.slice(0, 2000)}`,
        },
      ],
    });

    const firstLine = response.content[0].text.trim().split('\n')[0].toUpperCase();
    return firstLine === 'YES';
  } catch (err) {
    console.error(`[Classifier] API error: ${err.message} — letting post through`);
    return true;
  }
}

module.exports = { isCreatorListPost };
