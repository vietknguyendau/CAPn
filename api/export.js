import { redis, pipeline, sportFrom, k } from "./_lib.js";

// GET /api/export?sport=nba|nfl -> CSV of every saved line snapshot, with the model's numbers at that moment.
export default async function handler(req, res) {
  try {
    const sport = sportFrom(req);
    const ids = (await redis("SMEMBERS", k(sport, "games:all"))) || [];
    const metas = await pipeline(ids.map((id) => ["GET", `game:${id}`]));
    const snaps = await pipeline(ids.map((id) => ["LRANGE", `snaps:${id}`, 0, -1]));
    const rows = ["game_id,commence_time,home,away,captured_at,spread_home,total,model_margin,model_total"];
    ids.forEach((id, i) => {
      const m = metas[i] ? JSON.parse(metas[i]) : {};
      for (const s of (snaps[i] || []).map((x) => JSON.parse(x))) {
        rows.push([id, m.commence_time, m.home, m.away, s.t, s.spread, s.total, s.pm, s.pt]
          .map((v) => (v == null ? "" : v)).join(","));
      }
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${sport.id}_line_snapshots.csv`);
    res.send(rows.join("\n"));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
