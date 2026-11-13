import { getJSON, captureOdds } from "./_lib.js";

// Called by the daily Vercel cron (see vercel.json). Vercel sends CRON_SECRET automatically.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const model = await getJSON("model:latest");
    const odds = await captureOdds(model);
    res.json({ ok: true, games: odds.games.length, remaining: odds.remaining });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
