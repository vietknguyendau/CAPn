import { getJSON, redis, pipeline, sportFrom, k } from "./_lib.js";

// GET /api/history?sport=nba|nfl
//   replay: the model replayed against closing lines (computed by the model scripts)
//   live:   the board's own last pre-game number for each game, graded once the final score is in
// Each row: [date, away, home, spread (home line), total, model margin, model total, away pts, home pts]
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const sport = sportFrom(req);
    const [replay, results] = await Promise.all([
      getJSON(k(sport, "history:replay")),
      getJSON(k(sport, "results:recent")),
    ]);

    const ids = (await redis("SMEMBERS", k(sport, "games:all"))) || [];
    const metas = await pipeline(ids.map((id) => ["GET", `game:${id}`]));
    const lasts = await pipeline(ids.map((id) => ["LINDEX", `snaps:${id}`, -1]));
    const etDay = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const dayDiff = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

    const live = [];
    let pending = 0;
    ids.forEach((id, i) => {
      const m = metas[i] ? JSON.parse(metas[i]) : null;
      const s = lasts[i] ? JSON.parse(lasts[i]) : null;
      if (!m || !s || Date.parse(m.commence_time) > Date.now()) return; // not played yet
      const day = etDay(m.commence_time);
      const r = (results || []).find((x) => x[1] === m.away && x[2] === m.home && dayDiff(x[0], day) <= 1);
      if (!r) { pending += 1; return; }
      live.push([day, m.away, m.home, s.spread, s.total, s.pm, s.pt, r[3], r[4]]);
    });
    live.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

    res.json({ sport: sport.id, replay, live, pending });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
