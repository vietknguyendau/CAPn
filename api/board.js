import { getJSON, captureOdds, predict, pipeline } from "./_lib.js";

// GET /api/board            -> odds + model predictions (auto-captures if odds are stale)
// GET /api/board?refresh=1  -> capture now, if the last capture is over 10 minutes old
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const model = await getJSON("model:latest");
    let odds = await getJSON("odds:latest");
    const age = odds ? (Date.now() - Date.parse(odds.captured_at)) / 60000 : Infinity;
    const staleAfter = Number(process.env.STALE_MINUTES || 30);
    const wantsRefresh = Boolean(req.query.refresh);
    let note = null;

    if (age > staleAfter || (wantsRefresh && age > 10)) {
      try {
        odds = await captureOdds(model);
      } catch (e) {
        if (!odds) throw e;
        note = `Showing the last saved odds. New capture failed: ${e.message}`;
      }
    } else if (wantsRefresh) {
      note = `Odds were captured ${Math.round(age)} minutes ago. Manual capture is limited to once every 10 minutes to save API requests.`;
    }

    const opens = await pipeline(odds.games.map((g) => ["LINDEX", `snaps:${g.id}`, 0]));
    const games = odds.games.map((g, i) => {
      const o = opens[i] ? JSON.parse(opens[i]) : null;
      return {
        ...g,
        open_spread: o?.spread ?? null,
        open_total: o?.total ?? null,
        pred: model ? predict(model, g) : null,
      };
    });

    res.json({
      captured_at: odds.captured_at,
      remaining: odds.remaining,
      model: model
        ? { uploaded_at: model.uploaded_at, trained_through: model.trained_through, test: model.test }
        : null,
      games,
      note,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
