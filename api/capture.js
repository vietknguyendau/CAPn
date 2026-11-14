import { getJSON, captureOdds, getInjuries, sportFrom, SPORTS, k } from "./_lib.js";

// Daily Vercel cron for the NBA (see vercel.json). /api/capture?sport=nfl works too.
export async function run(req, res, sport) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const model = await getJSON(k(sport, "model:latest"));
    const inj = await getInjuries(sport);
    const odds = await captureOdds(sport, model, inj);
    res.json({ ok: true, sport: sport.id, games: odds.games.length, remaining: odds.remaining });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export default (req, res) => run(req, res, req.query?.sport ? sportFrom(req) : SPORTS.nba);
