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

// ---------- Team names (Odds API / ESPN full names -> model abbreviations) ----------
const NBA_TEAMS = {
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

// nflverse abbreviations (note: Rams are LA, not LAR).
const NFL_TEAMS = {
  "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
  "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LA", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
  "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
  "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
};

// The NBA keeps its original storage keys so existing line history carries over.
export const SPORTS = {
  nba: { id: "nba", odds: "basketball_nba", espn: "basketball/nba", teams: NBA_TEAMS, prefix: "", staleMin: 30 },
  nfl: { id: "nfl", odds: "americanfootball_nfl", espn: "football/nfl", teams: NFL_TEAMS, prefix: "nfl:", staleMin: 120 },
};

export function sportFrom(req) {
  const id = String(req.query?.sport || "nba").toLowerCase();
  return SPORTS[id] || SPORTS.nba;
}

export const k = (sport, name) => `${sport.prefix}${name}`;

export function abbr(name, sport = SPORTS.nba) {
  const T = sport.teams;
  if (T[name]) return T[name];
  const last = name.split(" ").pop();
  const hit = Object.keys(T).find((x) => x.endsWith(last));
  return hit ? T[hit] : name.slice(0, 3).toUpperCase();
}

// ---------- Odds capture ----------
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summarize(e, sport) {
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
    home_abbr: abbr(e.home_team, sport),
    away_abbr: abbr(e.away_team, sport),
    spread_home: median(spreads), // consensus (median) home spread, e.g. -5.5
    total: median(totals),        // consensus total
    books: (e.bookmakers || []).length,
  };
}

export async function captureOdds(sport, model, inj = null) {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("ODDS_API_KEY is missing. Add it in Vercel under Settings, Environment Variables, then redeploy.");

  const url = `https://api.the-odds-api.com/v4/sports/${sport.odds}/odds?apiKey=${key}&regions=us&markets=spreads,totals&oddsFormat=american`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`The Odds API returned ${r.status}: ${await r.text()}`);
  const events = await r.json();
  const remaining = r.headers.get("x-requests-remaining");
  const t = new Date().toISOString();
  // Requests left are shared by every sport on the account, so keep one copy for the whole site.
  if (remaining != null) await setJSON("quota", { remaining, used: r.headers.get("x-requests-used"), t });
  const games = events.map((e) => summarize(e, sport));

  await setJSON(k(sport, "odds:latest"), { captured_at: t, remaining, games });

  // Save a snapshot for every game that hasn't tipped yet (pre-game lines only).
  const now = Date.now();
  const cmds = [];
  for (const g of games) {
    if (Date.parse(g.commence_time) <= now) continue;
    const injuries = inj ? { home: teamInjuries(sport, inj, model, g.home_abbr), away: teamInjuries(sport, inj, model, g.away_abbr) } : null;
    const p = model ? predict(sport, model, g, injuries) : null;
    const snap = { t, spread: g.spread_home, total: g.total, pm: p ? +p.margin.toFixed(2) : null, pt: p ? +p.total.toFixed(2) : null };
    cmds.push(["RPUSH", `snaps:${g.id}`, JSON.stringify(snap)]);
    cmds.push(["SET", `game:${g.id}`, JSON.stringify({ commence_time: g.commence_time, home: g.home_abbr, away: g.away_abbr })]);
    cmds.push(["SADD", k(sport, "games:all"), g.id]);
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

export function predict(sport, model, g, injuries = null) {
  return sport.id === "nfl" ? predictNFL(model, g) : predictNBA(model, g, injuries);
}

// NFL predictions are computed by nfl_model.py; here we just find this game's row.
function predictNFL(model, g) {
  const day = gameDay(g.commence_time);
  const p = (model.predictions || []).find((x) =>
    x.home === g.home_abbr && x.away === g.away_abbr && Math.abs(daysBetween(x.gameday, day)) <= 1);
  if (!p) return null;
  return { margin: p.margin, total: p.total, home_rest: p.home_rest, away_rest: p.away_rest, week: p.week };
}

function km(arenas, a, b) {
  const A = arenas?.[a], B = arenas?.[b];
  if (!A || !B) return 0;
  const r = Math.PI / 180;
  const dp = (B[0] - A[0]) * r, dl = (B[1] - A[1]) * r;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(A[0] * r) * Math.cos(B[0] * r) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function predictNBA(model, g, injuries) {
  const h = model.teams?.[g.home_abbr];
  const a = model.teams?.[g.away_abbr];
  if (!h || !a) return null;

  const day = gameDay(g.commence_time);
  const rest = (t) => (t.last_game ? Math.min(Math.max(daysBetween(t.last_game, day), 0), 4) : 4);
  const rh = rest(h);
  const ra = rest(a);
  // Games in the last few days (from each team's last three game dates).
  const within = (t, n) => (t.recent_dates || []).filter((d) => {
    const x = daysBetween(d, day);
    return x >= 1 && x <= n;
  }).length;
  const h3 = within(h, 3) >= 2 ? 1 : 0, a3 = within(a, 3) >= 2 ? 1 : 0;   // 3rd game in 4 nights
  const h4 = within(h, 5) >= 3 ? 1 : 0, a4 = within(a, 5) >= 3 ? 1 : 0;   // 4th game in 6 nights

  // Travel to tonight's arena (the home team's) from each team's last game.
  const arenas = model.arenas || {};
  const here = g.home_abbr;
  const kmH = h.last_loc ? km(arenas, h.last_loc, here) : 0;
  const kmA = a.last_loc ? km(arenas, a.last_loc, here) : 0;
  const tz = (x) => arenas[x]?.[2] ?? 0;
  const tzH = h.last_loc ? tz(here) - tz(h.last_loc) : 0;
  const tzA = a.last_loc ? tz(here) - tz(a.last_loc) : 0;
  const trip = Math.min((a.away_streak ?? 0) + 1, 7);
  const alt = (model.altitude || []).includes(here) ? 1 : 0;

  // Feature names match nba_model.py exactly. Injuries are added below, player by player.
  const f = {
    D_NET_L10: h.NET_L10 - a.NET_L10,
    D_NET_SZN: h.NET_SZN - a.NET_SZN,
    D_REST: rh - ra,
    D_B2B: (rh === 1 ? 1 : 0) - (ra === 1 ? 1 : 0),
    D_G3IN4: h3 - a3,
    D_G4IN6: h4 - a4,
    D_TRAVEL: (kmH - kmA) / 1000,
    D_TZ_EAST: tzH - tzA,
    TRIP_A: trip,
    HOME_ALT: alt,
    D_MISS_VAL: 0, S_MISS_VAL: 0,
    PACE_SZN_H: h.PACE_SZN, PACE_SZN_A: a.PACE_SZN,
    PACE_L10_H: h.PACE_L10, PACE_L10_A: a.PACE_L10,
    ORTG_SZN_H: h.ORTG_SZN, DRTG_SZN_H: h.DRTG_SZN,
    ORTG_SZN_A: a.ORTG_SZN, DRTG_SZN_A: a.DRTG_SZN,
  };
  const lin = (m) => m.features.reduce((s, k, i) => s + m.coefs[i] * (f[k] ?? 0), m.intercept);
  const base = lin(model.margin);
  const baseTotal = lin(model.total);
  if (!Number.isFinite(base) || !Number.isFinite(baseTotal)) return null;

  // Injury adjustment: each listed player's value, times how likely he is to sit.
  const sum = (list, key) => (list || []).reduce((s, x) => s + (x[key] || 0), 0);
  const adjHome = sum(injuries?.home, "eff_m"), adjAway = sum(injuries?.away, "eff_m");
  const injMargin = adjHome - adjAway;
  const injTotal = sum(injuries?.home, "eff_t") + sum(injuries?.away, "eff_t");

  return {
    margin: base + injMargin, total: baseTotal + injTotal,
    base_margin: base, base_total: baseTotal, inj_margin: injMargin, inj_total: injTotal,
    inj_home: adjHome, inj_away: adjAway,
    rest_home: rh, rest_away: ra, g3_home: h3, g3_away: a3, g4_home: h4, g4_away: a4,
    km_home: Math.round(kmH), km_away: Math.round(kmA), tz_home: tzH, tz_away: tzA,
    trip_away: trip, altitude: alt,
  };
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

export async function getInjuries(sport) {
  let cached = null;
  try { cached = await getJSON(k(sport, "injuries:latest")); } catch {}
  if (cached && Date.now() - Date.parse(cached.t) < 20 * 60000) return cached;
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sport.espn}/injuries`);
    if (!r.ok) throw new Error(`ESPN ${r.status}`);
    const j = await r.json();
    const teams = {};
    for (const team of j.injuries || []) {
      const ab = abbr(team.displayName || "", sport);
      teams[ab] = (team.injuries || []).map((inj) => ({
        name: inj.athlete?.displayName || "",
        n: normName(inj.athlete?.displayName),
        level: level(inj),
        pos: inj.athlete?.position?.abbreviation || "",
        detail: inj.shortComment || inj.details?.type || "",
      })).filter((x) => x.level && x.n);
    }
    const out = { t: new Date().toISOString(), teams };
    await setJSON(k(sport, "injuries:latest"), out);
    return out;
  } catch (e) {
    return cached ? { ...cached, stale: true } : { t: null, teams: {}, error: e.message };
  }
}

// Injuries for one team, with minutes from the model so we know who matters.
export function teamInjuries(sport, inj, model, team) {
  return sport.id === "nfl" ? nflInjuries(inj, model, team) : nbaInjuries(inj, model, team);
}

// NFL: only starters matter here (from recent snap counts). The starting QB is always key;
// other starters become key when two or more are out or doubtful.
function nflInjuries(inj, model, team) {
  const list = inj.teams?.[team] || [];
  const players = model?.players || [];
  const out = list.map((p) => {
    const hit = players.find((x) => x.n === p.n && x.t === team);
    if (!hit && players.length) return null;
    return { name: p.name, level: p.level, pos: hit?.pos || p.pos, role: hit?.role || null,
             share: hit?.pct ?? null, key: hit?.role === "QB1" };
  }).filter(Boolean);
  const bigOut = out.filter((x) => x.role === "starter" && x.level !== "questionable");
  if (bigOut.length >= 2) bigOut.forEach((x) => { x.key = true; });
  const rank = (x) => (x.role === "QB1" ? 2 : 0) + (x.level === "out" ? 1 : 0);
  return out.sort((a, b) => rank(b) - rank(a));
}

// Chance a player sits, by status. Questionable players play more often than not, so they count half.
const SIT = { out: 1, doubtful: 0.85, questionable: 0.5 };

function nbaInjuries(inj, model, team) {
  const list = inj.teams?.[team] || [];
  const players = model?.players || [];
  const valued = players.some((x) => x.mg != null);
  if (!valued) return nbaInjuriesOld(list, players, model, team);
  return list.map((p) => {
    const hit = players.find((x) => x.n === p.n && x.t === team);
    if (!hit) return null; // not in the rotation
    const fr = hit.fr ?? 1;
    // A player who has sat most recent games is already reflected in the team's ratings.
    const longTerm = fr < 0.3;
    const sit = SIT[p.level] ?? 0;
    const impact = hit.mg * fr; // points of margin lost if he sits, adjusted for recent availability
    return { name: p.name, level: p.level, detail: p.detail, mpg: hit.m, impact,
             eff_m: impact * sit, eff_t: (hit.tt || 0) * fr * sit,
             key: impact <= -2.5, longTerm };
  }).filter((x) => x && (x.impact <= -0.3 || x.key))
    .sort((a, b) => a.impact - b.impact);
}

// For a model uploaded before player values existed.
function nbaInjuriesOld(list, players, model, team) {
  const teamGames = model?.teams?.[team]?.games || 0;
  return list.map((p) => {
    const hit = players.find((x) => x.n === p.n && x.t === team) || players.find((x) => x.n === p.n);
    const mpg = hit ? hit.m : null;
    const longTerm = hit && teamGames >= 8 ? hit.gp < teamGames * 0.4 : !hit && players.length > 0;
    const key = mpg != null && mpg >= 24 && !longTerm;
    return { name: p.name, level: p.level, detail: p.detail, mpg, key, longTerm };
  }).filter((p) => p.mpg == null ? !players.length : p.mpg >= 15)
    .sort((a, b) => (b.mpg || 0) - (a.mpg || 0));
}
