import { getJSON, captureOdds, getInjuries, sportFrom, SPORTS, k } from "./_lib.js";

// Scheduled captures: Vercel crons (vercel.json) and the GitHub "Capture lines" workflow.
// Allowed callers: Vercel's cron, or anyone sending CRON_SECRET or MODEL_SECRET.
// Never captures more than once every 10 minutes per sport.
function allowed(req) {
  const auth = req.headers.authorization || "";
  const cron = process.env.CRON_SECRET, model = process.env.MODEL_SECRET;
  if (cron && auth === `Bearer ${cron}`) return true;
  if (model && auth === `Bearer ${model}`) return true;
  return !cron && /vercel-cron/i.test(req.headers["user-agent"] || "");
}

export async function run(req, res, sport) {
  if (!allowed(req)) return res.status(401).json({ error: "Unauthorized" });
  try {
    const last = await getJSON(k(sport, "odds:latest"));
    if (last && Date.now() - Date.parse(last.captured_at) < 10 * 60000) {
      return res.json({ ok: true, sport: sport.id, skipped: "captured in the last 10 minutes" });
    }
    const model = await getJSON(k(sport, "model:latest"));
    const inj = await getInjuries(sport);
    const odds = await captureOdds(sport, model, inj);
    res.json({ ok: true, sport: sport.id, games: odds.games.length, remaining: odds.remaining });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export default (req, res) => run(req, res, req.query?.sport ? sportFrom(req) : SPORTS.nba);
