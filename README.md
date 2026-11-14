# Line board (NBA + NFL)

Live NBA and NFL spreads and totals from The Odds API, compared against your own model, with every line snapshot saved so you can track line movement and closing line value.

## What runs where

- **Vercel (the website):** pulls odds, saves snapshots to Redis, does the model math, shows the board.
- **GitHub Actions:** `model/nba_model.py` and `model/nfl_model.py` retrain on a schedule and upload to the site. Both data sources (ESPN box scores via sportsdataverse, and nflverse) are hosted on GitHub.

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

### 5. Turn on automatic model updates
1. Make sure the `.github` folder was uploaded: `.github/workflows/nba-model.yml` and `nfl-model.yml` should show in the repo.
2. Repo → Settings → Secrets and variables → Actions → New repository secret. Add:
   - `BOARD_URL`: your site address, like `https://nba-board.vercel.app`
   - `MODEL_SECRET`: the same password as in Vercel
3. Actions tab → "NBA model" → Run workflow (and the same for "NFL model"). A green check means it uploaded.

After that, the NBA model updates at 9 AM and 3 PM Central every day, and the NFL model Monday, Tuesday and Friday mornings. `Update model.bat` still works as a manual backup on Windows.

## Keeping the site private
Vercel's own login lock (free on every plan) keeps everyone but you out:
1. Vercel → your project → Settings → Deployment Protection.
2. Turn on **Vercel Authentication** and choose **All Deployments**. Save.
3. On the same page, under **Protection Bypass for Automation**, add a secret and copy it.
4. GitHub repo → Settings → Secrets and variables → Actions → New repository secret: `VERCEL_BYPASS` = that secret.

Visitors now have to sign in to your Vercel account. The GitHub jobs send the bypass secret in the `x-vercel-protection-bypass` header. All scheduled captures run from GitHub (`capture-lines.yml`), so `vercel.json` has no crons.

## How odds get captured
- **Opening the site never uses Odds API requests.** It shows the last saved odds, with fresh injuries and model numbers.
- **Capture odds now** pulls fresh lines (2 requests per sport), at most once every 10 minutes.
- Scheduled captures (GitHub "Capture lines"), so every game has a pre-game line for the History tab:
  - NBA: 23:30 and 01:30 UTC daily, before early and late tips.
  - NFL: 16:00 UTC Sun/Mon/Thu, plus 17:15 and 23:45 UTC Sunday and 23:30 UTC Mon/Thu.
  - About 180 requests a month, leaving roughly 320 of the free 500 for the button.
- `/api/capture` only runs for requests carrying `MODEL_SECRET` (or `CRON_SECRET`), and never more than once every 10 minutes.
- To bring back automatic captures when the page opens, set `STALE_MINUTES` (for example `60`) in Vercel and redeploy.

## Finding an edge
- **Closing line value (History → Board picks):** each pick is graded at the first saved line where it reached the Green Zone, and compared with the last line saved before tip-off. Consistently positive line value over a few hundred picks is the best sign of a real edge.
- **Injury news alerts:** when a valued player's status changes (ESPN), the board compares how far the line has moved since with what the player is worth. Blue NEWS notes flag news the line may not reflect yet. Changes are only noticed when the site or a scheduled capture checks injuries (at most every 20 minutes).
- **Line shopping:** every book's numbers are saved with each capture. The board shows the best number for the lean side among the books you tick under "My sportsbooks".
- **Totals** are recentered on the last 60 games so the model no longer leans Over, but they still haven't beaten closing lines in testing, so the board labels them low confidence.

## NBA model (v3)
- **Ratings:** offensive, defensive and net rating per 100 possessions, season-to-date and last 10 games, blended with last season's early on.
- **Rest and schedule:** back-to-backs, 3 games in 4 nights, 4 games in 6 nights.
- **Travel:** distance flown since the last game, time zones crossed going east, the away team's road-trip length, and altitude (Denver, Utah).
- **Player values:** each player's game score above a replacement player, per game, learned against real results. When ESPN lists a player Out, the board subtracts his value from the model's number (half for Questionable, most of it for Doubtful). A player who has sat most recent games is already in the team's ratings, so he counts less.
- **Amber ("Check news"):** a key player (worth 2.5+ points) is questionable or doubtful, or the model is 6+ off the spread or 9+ off the total.

Backtest on 2023-24 through 2025-26 (3,701 games), margin error: v2 11.10, v3 11.06; games with a big injury: 12.15 to 11.75. Totals: 15.64 to 15.59, mostly from altitude. Travel alone barely moved spreads, since rest already captures most of it. These measure accuracy against results, not against betting lines.

Limits: box-score values undersell defense-first players, so no player's absence is allowed to help his team. ESPN's injury feed and the sportsdataverse box scores are unofficial and can change without notice; the footer shows when the model last updated.

## NFL
The NFL tab works like the NBA one. Its model retrains Monday, Tuesday and Friday mornings (setup in step 5).

Honest backtest: on 2022–2025, the model's 2+ point edges against the closing line won about 49–51% of the time, below the 52.4% needed at -110. Public play-by-play data is already priced into NFL lines. Use the NFL board as a sanity check and for line movement, not as a source of picks. The site footer shows the latest backtest after each run.

Odds API: the NFL board captures at most every 2 hours when opened, plus Sunday, Monday and Thursday mornings automatically.

## History tab
Each sport has a **History** view (top right), graded at whatever Green Zone numbers you set:
- **Board picks (live):** the board's last saved number before each game, against the median line at that moment. Graded once final scores arrive with the next model run. This is the honest record of what the board told you.
- **Replay (this season and last):** the model's pre-game number for every game, trained only on earlier seasons, against closing lines (NBA: DraftKings via ESPN's game files, from December 2025 on; NFL: nflverse). NBA replays use who actually sat, so they know slightly more than the board did at the time.

It shows the record and units at -110, a running-units chart, win rate by edge size, and every Green Zone pick with its result.

`model/data/nba_lines.json` is a starter cache of closing lines; the GitHub Action keeps it current.

## Data
- `/api/export?sport=nba` (or `nfl`) downloads every snapshot as CSV: line, total, and the model's numbers at that moment. The first snapshot per game is the open; the last pre-game snapshot is your closing line.
- `/api/model` shows when the model was last uploaded.
