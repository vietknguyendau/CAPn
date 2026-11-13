import { getJSON, setJSON, authorized } from "./_lib.js";

// POST /api/model  (Authorization: Bearer MODEL_SECRET) -> save model from the Python script
// GET  /api/model  -> model info
export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      if (!authorized(req, process.env.MODEL_SECRET)) {
        return res.status(401).json({ error: "Wrong or missing MODEL_SECRET." });
      }
      const m = req.body;
      if (!m || !m.teams || !m.margin || !m.total) {
        return res.status(400).json({ error: "Model upload is missing teams, margin or total." });
      }
      m.uploaded_at = new Date().toISOString();
      await setJSON("model:latest", m);
      return res.json({ ok: true, teams: Object.keys(m.teams).length, uploaded_at: m.uploaded_at });
    }
    const m = await getJSON("model:latest");
    res.json(m ? { uploaded_at: m.uploaded_at, trained_through: m.trained_through, test: m.test, teams: Object.keys(m.teams).length } : null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
