# NBA line board

Live NBA spreads and totals from The Odds API, compared against your own model, with every line snapshot saved so you can track line movement and closing line value.

## What runs where

- **Vercel (the website):** pulls odds, saves snapshots to Redis, does the model math, shows the board.
- **Your computer:** `model/nba_model_v1.py` trains the model on nba_api data and uploads it to the site. (stats.nba.com blocks cloud servers, so this part can't run on Vercel.)

## Setup

### 1. Get an Odds API key
Sign up at the-odds-api.com. The free plan works to start. Copy your API key.

### 2. Put the code on GitHub
1. Create a new repository on github.com, for example `nba-board`.
2. Unzip this project. Open the `nba-board` folder, select **everything inside it** (`index.html`, `api`, `model`, `package.json`, `vercel.json`, `README.md`), and drag those into GitHub's upload page.
3. Check the repo's main page: `index.html` and the `api` folder must be at the top level, not inside another folder.

### 3. Deploy on Vercel
1. vercel.com → Add New → Project → import the repo.
2. Open **Environment Variables** and add:
   - `ODDS_API_KEY`: your key from step 1
   - `MODEL_SECRET`: make up a long password; the Python script uses it to upload
   - `CRON_SECRET`: optional, any random string (protects the daily capture job)
3. Click Deploy.

### 4. Connect Redis
1. In the Vercel project, open **Storage** → add **Upstash Redis** (free) → connect it to this project.
2. Go to Deployments → the latest deployment → **Redeploy**. New environment variables only apply after a redeploy.

The code accepts either `KV_REST_API_URL`/`KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, so either naming works.

### 5. Upload the model
On your computer:
```
pip install nba_api pandas numpy scikit-learn requests
```
Open `model/nba_model_v1.py`, set `BOARD_URL` to your Vercel URL, then run:
```
python model/nba_model_v1.py
```
Paste your `MODEL_SECRET` when asked. Re-run every day or two to keep team ratings current.

## How odds get captured
- Opening the board captures fresh odds if the last capture is over 30 minutes old (`STALE_MINUTES` env var changes this).
- **Capture odds now** forces a capture, at most once every 10 minutes.
- A daily cron at 22:00 UTC (about 2 hours before most tip-offs) captures a near-closing line, even if you don't open the site.
- Each capture uses 2 Odds API requests (spreads + totals, US books). The board shows how many you have left.

## Data
- `/api/export` downloads every snapshot as CSV: line, total, and the model's numbers at that moment. The first snapshot per game is the open; the last pre-game snapshot is your closing line.
- `/api/model` shows when the model was last uploaded.
