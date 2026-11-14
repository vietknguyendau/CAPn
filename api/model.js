import { getJSON, setJSON, authorized, sportFrom, k } from "./_lib.js";

// POST /api/model?sport=nba|nfl  (Authorization: Bearer MODEL_SECRET) -> save a model upload
// GET  /api/model?sport=nba|nfl  -> model info
export default async function handler(req, res) {
  try {
    const sport = sportFrom(req);
    if (req.method === "POST") {
      if (!authorized(req, process.env.MODEL_SECRET)) {
        return res.status(401).json({ error: "Wrong or missing MODEL_SECRET." });
      }
      const m = req.body;
      const need = sport.id === "nfl" ? ["predictions", "margin", "total"] : ["teams", "margin", "total"];
      const missing = need.filter((x) => !m || !m[x]);
      if (missing.length) {
        return res.status(400).json({ error: `Model upload is missing ${missing.join(", ")}.` });
      }
      m.uploaded_at = new Date().toISOString();
      // History and recent scores are stored on their own so the board stays fast.
      const { history, results, ...model } = m;
      if (history) await setJSON(k(sport, "history:replay"), { ...history, uploaded_at: m.uploaded_at });
      if (results) await setJSON(k(sport, "results:recent"), results);
      await setJSON(k(sport, "model:latest"), model);
      return res.json({ ok: true, sport: sport.id, teams: Object.keys(m.teams || {}).length,
                        predictions: (m.predictions || []).length, uploaded_at: m.uploaded_at });
    }
    const m = await getJSON(k(sport, "model:latest"));
    res.json(m ? { uploaded_at: m.uploaded_at, trained_through: m.trained_through, test: m.test,
                   teams: Object.keys(m.teams || {}).length } : null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
