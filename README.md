# Instagram AI Creator Monitor

Scans Instagram twice a week for posts mentioning AI creators/influencers and sends formatted results to a Telegram chat.

**Schedule:** Mondays and Thursdays at 9:00 AM UTC
- Monday run searches posts from the previous Thursday through today
- Thursday run searches posts from the previous Monday through today

Results are filtered to authors with ≥ 5,000 followers, sorted by follower count (largest first), and sent to Telegram.

---

## Prerequisites

- Node.js 18+
- An [Apify](https://apify.com) account (free tier works)
- A Telegram bot

---

## Setup

### 1. Get an Apify API token

1. Sign up at [apify.com](https://apify.com)
2. Go to **Settings → Integrations → API tokens**
3. Click **Create new token**, give it a name, copy the value

### 2. Create a Telegram bot and get the bot token

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts (choose a name and username)
3. BotFather will reply with a token like `123456789:ABCdef...` — copy it

### 3. Find your Telegram chat ID

**For a personal chat with the bot:**
1. Start a conversation with your bot (send it any message)
2. Open this URL in your browser, replacing `<BOT_TOKEN>` with your token:
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
   ```
3. Look for `"chat":{"id":...}` in the response — that number is your chat ID

**For a group chat:**
1. Add the bot to the group
2. Send a message in the group
3. Use the same `getUpdates` URL above — the group chat ID will be a negative number like `-1001234567890`

### 4. Configure environment variables

```bash
cp .env.instagram-monitor.example .env.instagram-monitor
```

Open `.env.instagram-monitor` and fill in your values:

```
APIFY_API_TOKEN=your_apify_api_token_here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_telegram_chat_id_here
```

> `.env.instagram-monitor` is listed in `.gitignore` and will never be committed.

### 5. Install dependencies

```bash
npm install
```

---

## Running locally

**Manual run (last 7 days):**
```bash
node run-now.js
```

**Manual run with a custom date window:**
```bash
node run-now.js --days 5
```

**Simulate a scheduled run (Monday/Thursday date window logic):**
```bash
node index.js
```

---

## Deploying to Railway

### 1. Push to GitHub

Create a new GitHub repository and push this project to it:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/instagram-ai-monitor.git
git push -u origin main
```

### 2. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project → Deploy from GitHub repo**
3. Select your repository

### 3. Set environment variables in Railway

1. In your Railway project, click the service → **Variables** tab
2. Add the following variables:
   - `APIFY_API_TOKEN`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

### 4. Configure the cron schedule

1. In your Railway service settings, go to **Settings → Cron Schedule**
2. Set the schedule to:
   ```
   0 9 * * 1,4
   ```
   This runs `npm start` (which calls `node index.js`) at 9:00 AM UTC every Monday and Thursday.

### 5. Deploy

Railway auto-deploys on every push to your connected branch. You can also trigger a manual deploy from the Railway dashboard.

---

## Project structure

```
instagram-ai-monitor/
├── index.js                        # Cron entry point (Monday/Thursday windows)
├── run-now.js                      # Manual trigger with --days flag
├── src/
│   ├── monitor.js                  # Core orchestration (stages 1–4)
│   ├── apify.js                    # Apify API calls
│   ├── telegram.js                 # Telegram message formatting and sending
│   └── keywords.js                 # Full keyword list
├── .env.instagram-monitor.example  # Template — commit this
├── .env.instagram-monitor          # Your secrets — never committed
├── .gitignore
├── package.json
└── README.md
```

---

## Telegram message format

Each matching post is formatted as:

```
👤 @username (12,500 followers)
🔍 Keyword matched: "AI creators to follow"
🔗 https://www.instagram.com/p/...
```

Messages longer than 4,096 characters are automatically split across multiple Telegram messages.

If no posts pass the filter, you'll receive:

```
✅ Instagram scan complete 2024-01-08 → 2024-01-11 — no new posts above 5K followers found.
```
