// Shared helpers. Files starting with "_" are not turned into routes by Vercel.

// ---------- Redis (Upstash REST, no packages needed) ----------
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function checkRedis() {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error("Redis isn't connected. In Vercel, open Storage, add Upstash Redis to this project, then redeploy.");
  }
}

export async function redis(...cmd) {
  checkRedis();
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(`Redis: ${j.error}`);
  return j.result;
}

export async function pipeline(cmds) {
  if (!cmds.length) return [];
  checkRedis();
  const r = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(`Redis: ${j.error || "pipeline failed"}`);
  return j.map((x) => x.result);
}

export async function getJSON(key) {
  const v = await redis("GET", key);
  return v ? JSON.parse(v) : null;
}

export async function setJSON(key, val) {
  return redis("SET", key, JSON.stringify(val));
}

export function authorized(req, secret) {
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

// ---------- Team names (Odds API full names -> nba_api abbreviations) ----------
const TEAMS = {
  "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN",
  "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
  "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
  "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
  "Los Angeles Clippers": "LAC", "LA Clippers": "LAC", "Los Angeles Lakers": "LAL",
  "Memphis Grizzlies": "MEM", "Miami Heat": "MIA", "Milwaukee Bucks": "MIL",
  "Minnesota Timberwolves": "MIN", "New Orleans Pelicans": "NOP", "New York Knicks": "NYK",
  "Oklahoma City Thunder": "OKC", "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI",
  "Phoenix Suns": "PHX", "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC",
  "San Antonio Spurs": "SAS", "Toronto Raptors": "TOR", "Utah Jazz": "UTA",
  "Washington Wizards": "WAS",
};

export function abbr(name) {
  if (TEAMS[name]) return TEAMS[name];
  const last = name.split(" ").pop();
  const hit = Object.keys(TEAMS).find((k) => k.endsWith(last));
  return hit ? TEAMS[hit] : name.slice(0, 3).toUpperCase();
}

// ---------- Odds capture ----------
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summarize(e) {
  const spreads = [];
  const totals = [];
  for (const b of e.bookmakers || []) {
    for (const m of b.markets || []) {
      if (m.key === "spreads") {
        const o = m.outcomes.find((x) => x.name === e.home_team);
        if (o && o.point != null) spreads.push(o.point);
      }
      if (m.key === "totals") {
        const o = m.outcomes.find((x) => x.name === "Over");
        if (o && o.point != null) totals.push(o.point);
      }
    }
  }
  return {
    id: e.id,
    commence_time: e.commence_time,
    home: e.home_team,
    away: e.away_team,
    home_abbr: abbr(e.home_team),
    away_abbr: abbr(e.away_team),
    spread_home: median(spreads), // consensus (median) home spread, e.g. -5.5
    total: median(totals),        // consensus total
    books: (e.bookmakers || []).length,
  };
}

export async function captureOdds(model) {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("ODDS_API_KEY is missing. Add it in Vercel under Settings, Environment Variables, then redeploy.");

  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds?apiKey=${key}&regions=us&markets=spreads,totals&oddsFormat=american`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`The Odds API returned ${r.status}: ${await r.text()}`);
  const events = await r.json();
  const remaining = r.headers.get("x-requests-remaining");
  const t = new Date().toISOString();
  const games = events.map(summarize);

  await setJSON("odds:latest", { captured_at: t, remaining, games });

  // Save a snapshot for every game that hasn't tipped yet (pre-game lines only).
  const now = Date.now();
  const cmds = [];
  for (const g of games) {
    if (Date.parse(g.commence_time) <= now) continue;
    const p = model ? predict(model, g) : null;
    const snap = { t, spread: g.spread_home, total: g.total, pm: p ? +p.margin.toFixed(2) : null, pt: p ? +p.total.toFixed(2) : null };
    cmds.push(["RPUSH", `snaps:${g.id}`, JSON.stringify(snap)]);
    cmds.push(["SET", `game:${g.id}`, JSON.stringify({ commence_time: g.commence_time, home: g.home_abbr, away: g.away_abbr })]);
    cmds.push(["SADD", "games:all", g.id]);
  }
  await pipeline(cmds);

  return { captured_at: t, remaining, games };
}

// ---------- Model ----------
// Calendar date of the game in Eastern time, as YYYY-MM-DD.
function gameDay(iso) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export function predict(model, g) {
  const h = model.teams?.[g.home_abbr];
  const a = model.teams?.[g.away_abbr];
  if (!h || !a) return null;

  const day = gameDay(g.commence_time);
  const rest = (t) => (t.last_game ? Math.min(Math.max(daysBetween(t.last_game, day), 0), 4) : 4);
  const rh = rest(h);
  const ra = rest(a);
  // Third game in four nights: both of the team's last two games were within 3 days.
  const g3 = (t) => ((t.recent_dates || []).filter((d) => {
    const n = daysBetween(d, day);
    return n >= 1 && n <= 3;
  }).length >= 2 ? 1 : 0);
  const h3 = g3(h);
  const a3 = g3(a);

  // Feature names match nba_model_v1.py exactly.
  const f = {
    D_NET_L10: h.NET_L10 - a.NET_L10,
    D_NET_SZN: h.NET_SZN - a.NET_SZN,
    D_REST: rh - ra,
    D_B2B: (rh === 1 ? 1 : 0) - (ra === 1 ? 1 : 0),
    D_G3IN4: h3 - a3,
    PACE_SZN_H: h.PACE_SZN, PACE_SZN_A: a.PACE_SZN,
    PACE_L10_H: h.PACE_L10, PACE_L10_A: a.PACE_L10,
    ORTG_SZN_H: h.ORTG_SZN, DRTG_SZN_H: h.DRTG_SZN,
    ORTG_SZN_A: a.ORTG_SZN, DRTG_SZN_A: a.DRTG_SZN,
  };
  const lin = (m) => m.features.reduce((s, k, i) => s + m.coefs[i] * f[k], m.intercept);
  const margin = lin(model.margin);
  const total = lin(model.total);
  if (!Number.isFinite(margin) || !Number.isFinite(total)) return null;
  return { margin, total, rest_home: rh, rest_away: ra, g3_home: h3, g3_away: a3 };
}

// ---------- Injuries (ESPN's public feed, cached 20 minutes) ----------
export function normName(name) {
  return String(name || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .split(/\s+/).filter(Boolean).join(" ");
}

function level(inj) {
  const s = `${inj.status || ""} ${inj.details?.fantasyStatus?.description || ""}`.toLowerCase();
  if (s.includes("out")) return "out";
  if (s.includes("doubtful")) return "doubtful";
  if (s.includes("questionable") || s.includes("day-to-day") || s.includes("gtd")) return "questionable";
  return null; // probable or unknown: ignore
}

export async function getInjuries() {
  let cached = null;
  try { cached = await getJSON("injuries:latest"); } catch {}
  if (cached && Date.now() - Date.parse(cached.t) < 20 * 60000) return cached;
  try {
    const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries");
    if (!r.ok) throw new Error(`ESPN ${r.status}`);
    const j = await r.json();
    const teams = {};
    for (const team of j.injuries || []) {
      const ab = abbr(team.displayName || "");
      teams[ab] = (team.injuries || []).map((inj) => ({
        name: inj.athlete?.displayName || "",
        n: normName(inj.athlete?.displayName),
        level: level(inj),
        detail: inj.shortComment || inj.details?.type || "",
      })).filter((x) => x.level && x.n);
    }
    const out = { t: new Date().toISOString(), teams };
    await setJSON("injuries:latest", out);
    return out;
  } catch (e) {
    return cached ? { ...cached, stale: true } : { t: null, teams: {}, error: e.message };
  }
}

// Injuries for one team, with minutes from the model so we know who matters.
export function teamInjuries(inj, model, team) {
  const list = inj.teams?.[team] || [];
  const players = model?.players || [];
  const teamGames = model?.teams?.[team]?.games || 0;
  return list.map((p) => {
    const hit = players.find((x) => x.n === p.n && x.t === team) || players.find((x) => x.n === p.n);
    const mpg = hit ? hit.m : null;
    // A player who has missed most of the season is already baked into the team's ratings.
    const longTerm = hit && teamGames >= 8 ? hit.gp < teamGames * 0.4 : !hit && players.length > 0;
    const key = mpg != null && mpg >= 24 && !longTerm;
    return { name: p.name, level: p.level, detail: p.detail, mpg, key, longTerm };
  }).filter((p) => p.mpg == null ? !players.length : p.mpg >= 15)
    .sort((a, b) => (b.mpg || 0) - (a.mpg || 0));
}
