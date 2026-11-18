-- Green Zone simulation and evaluation schema (design; NOT applied).
-- Apply only after approval: supabase db push, or paste into the Supabase SQL editor.
-- Everything a decision depends on is stored with a timestamp and never edited afterwards.

create table if not exists model_versions (
  id              text primary key,            -- e.g. 'nba-sim-0.1', 'nba-mean-2026-11-18'
  sport           text not null check (sport in ('nba', 'nfl')),
  kind            text not null check (kind in ('mean', 'sim', 'blend')),
  params          jsonb not null,               -- fitted settings (rubber, pace_sd, trust weight, coefficients)
  trained_through date,
  created_at      timestamptz not null default now()
);

create table if not exists games (
  id            text primary key,               -- The Odds API event id
  sport         text not null check (sport in ('nba', 'nfl')),
  espn_id       text,
  season        text not null,
  commence_time timestamptz not null,
  home          text not null,
  away          text not null
);
create index if not exists games_commence on games (sport, commence_time);

-- One row per book, market, side and capture. Immutable.
create table if not exists price_snapshots (
  id          bigserial primary key,
  game_id     text not null references games(id),
  captured_at timestamptz not null,
  book        text not null,
  market      text not null check (market in ('h2h', 'spreads', 'totals', 'player_prop')),
  side        text not null,                    -- 'home' | 'away' | 'over' | 'under' | prop selection
  point       numeric,                          -- spread or total; null for moneylines
  price       integer not null,                 -- American odds
  source      text not null default 'the-odds-api',
  unique (game_id, captured_at, book, market, side)
);
create index if not exists price_snapshots_game on price_snapshots (game_id, market, captured_at);

-- Injury and lineup changes, with where each came from. Unconfirmed reports are kept but flagged.
create table if not exists availability_events (
  id           bigserial primary key,
  sport        text not null,
  team         text not null,
  player       text not null,
  from_status  text,
  to_status    text not null,                   -- 'out' | 'doubtful' | 'questionable' | 'probable' | 'active' | 'starting'
  observed_at  timestamptz not null,
  source       text not null,                   -- 'espn-injuries', 'nba-official-report', ...
  source_url   text,
  confirmed    boolean not null default false
);
create index if not exists availability_events_team on availability_events (sport, team, observed_at);

-- Weather for outdoor NFL games.
create table if not exists weather_observations (
  id          bigserial primary key,
  game_id     text not null references games(id),
  observed_at timestamptz not null,
  forecast_for timestamptz not null,
  wind_mph    numeric,
  gust_mph    numeric,
  temp_f      numeric,
  precip_prob numeric,
  source      text not null default 'nws'
);

-- The agent's queue: every material change it noticed, deduplicated.
create table if not exists agent_events (
  id           bigserial primary key,
  detected_at  timestamptz not null default now(),
  sport        text not null,
  game_id      text references games(id),
  kind         text not null check (kind in ('injury', 'lineup', 'line_move', 'total_move', 'price_outlier', 'weather', 'schedule')),
  payload      jsonb not null,
  dedupe_key   text not null unique,            -- e.g. 'injury:nba:GSW:stephen curry:out:2026-11-18'
  processed_at timestamptz,
  run_id       uuid
);

-- Every simulation: inputs, seed, version and outputs. Immutable.
create table if not exists simulation_runs (
  id             uuid primary key default gen_random_uuid(),
  game_id        text not null references games(id),
  run_at         timestamptz not null default now(),
  model_version  text not null references model_versions(id),
  mean_version   text references model_versions(id),
  n_sims         integer not null check (n_sims in (1000, 10000, 100000)),
  seed           bigint not null,
  trigger        text not null check (trigger in ('schedule', 'injury', 'lineup', 'line_move', 'weather', 'manual', 'scenario')),
  agent_event_id bigint references agent_events(id),
  parent_run_id  uuid references simulation_runs(id),   -- the run this one is compared with
  inputs         jsonb not null,                -- mean margin/total, pace, uncertain players and their odds of sitting
  outputs        jsonb not null                 -- probabilities, score distribution, MC error, model band, scenarios
);
create index if not exists simulation_runs_game on simulation_runs (game_id, run_at);

-- One row per market and side evaluated at a run, at a specific book price. Immutable.
create table if not exists market_evaluations (
  id             bigserial primary key,
  run_id         uuid not null references simulation_runs(id),
  game_id        text not null references games(id),
  evaluated_at   timestamptz not null default now(),
  market         text not null,
  side           text not null,
  book           text not null,
  point          numeric,
  price          integer not null,
  break_even     numeric not null,              -- implied probability of the offered price
  no_vig_prob    numeric,                       -- market probability with the margin removed
  sim_prob       numeric not null,
  trust_weight   numeric not null,              -- fitted out of sample; 0 means "market knows best"
  blended_prob   numeric not null,              -- market + trust_weight x (sim - market), in log-odds
  prob_low       numeric not null,              -- 95% band from model uncertainty
  prob_high      numeric not null,
  ev             numeric not null,              -- blended_prob x decimal odds - 1
  classification text not null check (classification in ('GREEN_ZONE', 'WATCH', 'WAIT', 'PASS')),
  reasons        jsonb not null                 -- which conditions passed or failed
);
create index if not exists market_evaluations_game on market_evaluations (game_id, evaluated_at);

create table if not exists results (
  game_id   text primary key references games(id),
  home_pts  integer not null,
  away_pts  integer not null,
  final_at  timestamptz not null
);

-- Paper trading: a simulated bet each time a market is classified GREEN_ZONE (or WATCH, for comparison).
create table if not exists paper_trades (
  id              bigserial primary key,
  evaluation_id   bigint not null references market_evaluations(id),
  placed_at       timestamptz not null,
  stake_units     numeric not null default 1,
  price           integer not null,
  point           numeric,
  closing_point   numeric,
  closing_price   integer,
  clv_points      numeric,
  outcome         text check (outcome in ('win', 'loss', 'push')),
  profit_units    numeric
);

-- Monthly calibration and accuracy against the no-vig market, by sport, market and version.
create table if not exists calibration_reports (
  id              bigserial primary key,
  model_version   text not null references model_versions(id),
  market          text not null,
  period_start    date not null,
  period_end      date not null,
  n               integer not null,
  brier           numeric not null,
  brier_market    numeric not null,
  log_loss        numeric not null,
  log_loss_market numeric not null,
  trust_weight    numeric not null,
  bins            jsonb not null,
  created_at      timestamptz not null default now()
);

-- Immutability: block edits and deletes on the records decisions are judged by.
create or replace function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% rows are immutable', tg_table_name;
end $$;

do $$
declare t text;
begin
  foreach t in array array['price_snapshots', 'simulation_runs', 'market_evaluations', 'availability_events'] loop
    execute format('drop trigger if exists %I_immutable on %I', t, t);
    execute format('create trigger %I_immutable before update or delete on %I for each row execute function forbid_change()', t, t);
  end loop;
end $$;

-- Only the server (service role) writes; the dashboard reads through policies added with the auth setup.
alter table model_versions        enable row level security;
alter table games                 enable row level security;
alter table price_snapshots       enable row level security;
alter table availability_events   enable row level security;
alter table weather_observations  enable row level security;
alter table agent_events          enable row level security;
alter table simulation_runs       enable row level security;
alter table market_evaluations    enable row level security;
alter table results               enable row level security;
alter table paper_trades          enable row level security;
alter table calibration_reports   enable row level security;
