import { getJSON, captureOdds, predict, pipeline, getInjuries, getInjuryChanges, teamInjuries, newsAlerts, sportFrom, k } from "./_lib.js";

// GET /api/board?sport=nba|nfl         -> saved odds + model + injuries. Never spends Odds API requests.
// GET /api/board?sport=nba&refresh=1   -> capture fresh odds (2 requests), at most once every 10 minutes.
// Fresh odds otherwise come only from the scheduled captures in vercel.json.
// To bring back automatic captures on page load, set STALE_MINUTES (e.g. 60) in Vercel.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const sport = sportFrom(req);
    const model = await getJSON(k(sport, "model:latest"));
    let odds = await getJSON(k(sport, "odds:latest"));
    const age = odds ? (Date.now() - Date.parse(odds.captured_at)) / 60000 : Infinity;
    const autoAfter = Number(process.env[`STALE_MINUTES_${sport.id.toUpperCase()}`] || process.env.STALE_MINUTES || 0);
    const wantsRefresh = Boolean(req.query.refresh);
    let note = null;

    const inj = await getInjuries(sport);
    if ((wantsRefresh && age > 10) || (autoAfter > 0 && age > autoAfter)) {
      try {
        odds = await captureOdds(sport, model, inj);
      } catch (e) {
        if (!odds) throw e;
        note = `Showing the last saved odds. New capture failed: ${e.message}`;
      }
    } else if (wantsRefresh) {
      note = `Odds were captured ${Math.round(age)} minutes ago. Captures are limited to once every 10 minutes to save requests.`;
    }

    const quota = await getJSON("quota");
    const changes = await getInjuryChanges(sport);
    const saved = odds?.games || [];
    const allSnaps = await pipeline(saved.map((g) => ["LRANGE", `snaps:${g.id}`, 0, -1]));
    const games = saved.map((g, i) => {
      const snaps = (allSnaps[i] || []).map((x) => JSON.parse(x));
      const o = snaps[0] || null;
      const injuries = {
        home: teamInjuries(sport, inj, model, g.home_abbr),
        away: teamInjuries(sport, inj, model, g.away_abbr),
      };
      return {
        ...g,
        open_spread: o?.spread ?? null,
        open_total: o?.total ?? null,
        pred: model ? predict(sport, model, g, injuries) : null,
        injuries,
        news: model ? newsAlerts(sport, model, g, changes, snaps) : [],
      };
    });

    res.json({
      sport: sport.id,
      captured_at: odds?.captured_at || null,
      remaining: quota?.remaining ?? odds?.remaining ?? null,
      model: model
        ? { uploaded_at: model.uploaded_at, trained_through: model.trained_through, test: model.test }
        : null,
      games,
      note,
      injuries_at: inj.t,
      injuries_error: inj.error || (inj.stale ? "Injury feed didn't respond; showing the last saved report." : null),
      has_minutes: Boolean(model?.players?.length),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
