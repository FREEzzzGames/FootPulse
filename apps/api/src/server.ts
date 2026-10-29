import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import pg from "pg";
import { readFile } from "node:fs/promises";

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
const port = Number(process.env.PORT ?? 3000);
const pool = process.env.DATABASE_URL ? new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  max: 8, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000,
}) : null;
const cache = new Map<string, { expires: number; value: unknown }>();
const TTL = 30_000;
const STATS = "https://raw.githubusercontent.com/statsbomb/open-data/master/data";
const getCached = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const item = cache.get(key);
  if (item && item.expires > Date.now()) return item.value as T;
  const value = await fn(); cache.set(key, { expires: Date.now() + TTL, value }); return value;
};
const db = () => {
  if (!pool) throw Object.assign(new Error("PostgreSQL is not configured"), { statusCode: 503, code: "database_not_configured" });
  return pool;
};
const fetchJson = async (url: string) => {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "FootPulse/1.0 (open-data research)" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("Source returned HTTP " + r.status + ": " + url);
  return r.json() as Promise<any>;
};

await app.register(cors, { origin: process.env.CORS_ORIGIN?.split(",") ?? true });
app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.code((error as any).statusCode ?? 500).send({ error: (error as any).code ?? "internal_error", message: (error as Error).message });
});
app.get("/api/health", async () => {
  let database = "not_configured";
  if (pool) { try { await pool.query("SELECT 1"); database = "connected"; } catch { database = "unavailable"; } }
  return { status: database === "connected" ? "ok" : "degraded", service: "footpulse-api", database, timestamp: new Date().toISOString() };
});

app.get("/api/v1/players", async (request, reply) => {
  const q = String((request.query as any).q ?? "").trim();
  const limit = Math.min(50, Math.max(1, Number((request.query as any).limit ?? 20) || 20));
  if (q.length < 2) return reply.code(400).send({ error: "query_too_short", message: "Введите минимум 2 символа фамилии или имени." });
  const key = "players:" + q.toLocaleLowerCase("ru") + ":" + limit;
  return getCached(key, async () => {
    const result = await db().query(
      `SELECT p.id,p.full_name,p.given_name,p.family_name,p.birth_date,p.nationality,
        COUNT(DISTINCT pms.match_id)::int AS matches,
        COALESCE(SUM(pms.goals),0)::int AS goals, COALESCE(SUM(pms.assists),0)::int AS assists
       FROM players p LEFT JOIN player_match_stats pms ON pms.player_id=p.id
       WHERE p.full_name ILIKE $1 OR p.family_name ILIKE $1 OR EXISTS
         (SELECT 1 FROM player_aliases pa WHERE pa.player_id=p.id AND pa.alias ILIKE $1)
       GROUP BY p.id ORDER BY p.family_name NULLS LAST,p.full_name LIMIT $2`,
      ["%" + q.replace(/[%_\\]/g, "\\$&") + "%", limit]);
    return { data: result.rows, query: q, limit };
  });
});

app.get("/api/v1/matches", async (request) => {
  const q = request.query as { limit?: string; offset?: string; from?: string; to?: string; competition?: string; season?: string; team?: string };
  const limit = Math.min(100, Math.max(1, Number(q.limit ?? 50) || 50));
  const offset = Math.max(0, Number(q.offset ?? 0) || 0);
  const values: unknown[] = []; const filters: string[] = [];
  if (q.from) { values.push(q.from); filters.push("m.match_date >= $"+values.length+"::date"); }
  if (q.to) { values.push(q.to); filters.push("m.match_date < ($"+values.length+"::date + INTERVAL '1 day')"); }
  if (q.competition) { values.push("%"+q.competition+"%"); filters.push("c.name ILIKE $"+values.length); }
  if (q.season) { values.push(q.season); filters.push("s.name = $"+values.length); }
  if (q.team) { values.push("%"+q.team+"%"); filters.push("(ht.name ILIKE $"+values.length+" OR at.name ILIKE $"+values.length+")"); }
  values.push(limit); const lp=values.length; values.push(offset); const op=values.length;
  const result = await db().query(
    `SELECT m.id,m.match_date,m.status,m.home_score,m.away_score,ht.name AS home_team,at.name AS away_team,c.name AS competition,s.name AS season
     FROM matches m LEFT JOIN teams ht ON ht.id=m.home_team_id LEFT JOIN teams at ON at.id=m.away_team_id
     LEFT JOIN competitions c ON c.id=m.competition_id LEFT JOIN seasons s ON s.id=m.season_id
     ${filters.length ? "WHERE "+filters.join(" AND ") : ""}
     ORDER BY m.match_date DESC NULLS LAST LIMIT $${lp} OFFSET $${op}`, values);
  return { data: result.rows, pagination: { limit, offset } };
});

app.get("/api/v1/matches/:id/events", async (request) => {
  const id = Number((request.params as any).id);
  const result = await db().query(
    `SELECT e.id,e.minute,e.added_time,e.event_type,e.details,p.full_name AS player,t.name AS team
     FROM match_events e LEFT JOIN players p ON p.id=e.player_id LEFT JOIN teams t ON t.id=e.team_id
     WHERE e.match_id=$1 ORDER BY e.minute NULLS LAST,e.id`, [id]);
  return { data: result.rows };
});

app.get("/api/v1/sources", async () => {
  if (!pool) return { data: [
    { name: "OpenLigaDB", url: "https://www.openligadb.de/", status: "public_api_no_key", data: "fixtures and results" },
    { name: "StatsBomb Open Data", url: "https://github.com/statsbomb/open-data", status: "public_open_dataset", data: "selected competitions, matches and events" },
    { name: "football-data.co.uk", url: "https://www.football-data.co.uk/", status: "manual_import_candidate", data: "historical CSV results/statistics" },
    { name: "Wikidata", url: "https://www.wikidata.org/", status: "adapter_not_enabled", data: "reference entities" }
  ] };
  const result = await db().query("SELECT name,base_url,license_url,terms_url FROM data_sources ORDER BY name");
  return { data: result.rows };
});

app.post("/api/v1/admin/ingest/statsbomb", async (request, reply) => {
  if (!process.env.INGEST_TOKEN || request.headers.authorization !== "Bearer " + process.env.INGEST_TOKEN)
    return reply.code(401).send({ error: "unauthorized" });
  const database = db();
  const source = await database.query(
    `INSERT INTO data_sources(name,base_url,license_url,terms_url) VALUES($1,$2,$3,$4)
     ON CONFLICT(name) DO UPDATE SET base_url=EXCLUDED.base_url,license_url=EXCLUDED.license_url,terms_url=EXCLUDED.terms_url RETURNING id`,
    ["StatsBomb Open Data","https://github.com/statsbomb/open-data","https://github.com/statsbomb/open-data/blob/master/LICENSE.pdf","https://github.com/statsbomb/open-data"]);
  const sourceId = source.rows[0].id;
  const run = await database.query("INSERT INTO import_runs(source_id,status) VALUES($1,'running') RETURNING id",[sourceId]);
  const runId = run.rows[0].id;
  let seen=0, inserted=0, updated=0;
  try {
    const competitions = await fetchJson(STATS + "/competitions.json");
    const filter = request.body as { competitionId?: number; seasonId?: number; maxCompetitions?: number } | undefined;
    const candidates = competitions.filter((c:any) => (!filter?.competitionId || Number(c.competition_id)===Number(filter.competitionId)) && (!filter?.seasonId || Number(c.season_id)===Number(filter.seasonId))).slice(0,Math.min(30,Math.max(1,Number(filter?.maxCompetitions ?? 10))));
    for (const c of candidates) {
      const rows = await fetchJson(STATS + "/matches/" + c.competition_id + "/" + c.season_id + ".json");
      const comp = await database.query(
        `INSERT INTO competitions(name,country,competition_type) VALUES($1,$2,$3)
         ON CONFLICT DO NOTHING RETURNING id`, [c.competition_name, c.country_name ?? null, c.competition_gender ?? null]);
      let compId = comp.rows[0]?.id;
      if (!compId) compId = (await database.query("SELECT id FROM competitions WHERE name=$1 AND country IS NOT DISTINCT FROM $2 ORDER BY id LIMIT 1",[c.competition_name,c.country_name ?? null])).rows[0]?.id;
      const seasonName = String(c.season_name ?? "unknown");
      const seasonRow = await database.query(`INSERT INTO seasons(competition_id,name) VALUES($1,$2) ON CONFLICT(competition_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,[compId,seasonName]);
      for (const m of rows) {
        seen++;
        const homeName = String(m.home_team?.home_team_name ?? "Unknown");
        const awayName = String(m.away_team?.away_team_name ?? "Unknown");
        const home = await database.query(`INSERT INTO teams(name,team_type) VALUES($1,'other') ON CONFLICT DO NOTHING RETURNING id`,[homeName]);
        const homeId = home.rows[0]?.id ?? (await database.query("SELECT id FROM teams WHERE name=$1 ORDER BY id LIMIT 1",[homeName])).rows[0].id;
        const away = await database.query(`INSERT INTO teams(name,team_type) VALUES($1,'other') ON CONFLICT DO NOTHING RETURNING id`,[awayName]);
        const awayId = away.rows[0]?.id ?? (await database.query("SELECT id FROM teams WHERE name=$1 ORDER BY id LIMIT 1",[awayName])).rows[0].id;
        const date = m.match_date ? String(m.match_date) : null;
        const status = date && new Date(date) <= new Date() ? "finished" : "scheduled";
        const result = await database.query(
          `INSERT INTO matches(match_date,status,home_team_id,away_team_id,competition_id,season_id,home_score,away_score,source_updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())
           ON CONFLICT DO NOTHING RETURNING id`,
          [date,status,homeId,awayId,compId,seasonRow.rows[0].id,m.home_score ?? null,m.away_score ?? null]);
        if (result.rows[0]) inserted++; else updated++;
        const match = result.rows[0] ?? (await database.query("SELECT id FROM matches WHERE match_date IS NOT DISTINCT FROM $1 AND home_team_id=$2 AND away_team_id=$3 AND competition_id=$4 AND season_id=$5 ORDER BY id LIMIT 1",[date,homeId,awayId,compId,seasonRow.rows[0].id])).rows[0];
        await database.query(`INSERT INTO source_records(source_id,entity_type,external_id,internal_id,payload)
          VALUES($1,'match',$2,$3,$4::jsonb) ON CONFLICT(source_id,entity_type,external_id) DO UPDATE SET payload=EXCLUDED.payload,fetched_at=now()`,
          [sourceId,String(m.match_id),match.id,JSON.stringify(m)]);
      }
    }
    await database.query("UPDATE import_runs SET finished_at=now(),status='success',records_seen=$2,records_inserted=$3,records_updated=$4 WHERE id=$1",[runId,seen,inserted,updated]);
    cache.clear();
    return { status:"success", competitions:candidates.length, recordsSeen:seen, recordsInserted:inserted, recordsUpdated:updated, importRunId:runId };
  } catch (e) {
    await database.query("UPDATE import_runs SET finished_at=now(),status='partial',records_seen=$2,records_inserted=$3,records_updated=$4,error_message=$5 WHERE id=$1",[runId,seen,inserted,updated,String(e)]);
    throw e;
  }
});

app.post("/api/v1/admin/ingest/statsbomb-events", async (request, reply) => {
  if (!process.env.INGEST_TOKEN || request.headers.authorization !== "Bearer " + process.env.INGEST_TOKEN)
    return reply.code(401).send({ error: "unauthorized" });
  const body = request.body as { matchIds?: number[] };
  const ids = [...new Set((body?.matchIds ?? []).map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 20);
  if (!ids.length) return reply.code(400).send({ error: "matchIds_required", message: "Передайте до 20 StatsBomb match ID за один запуск." });
  const database = db();
  const source = await database.query("SELECT id FROM data_sources WHERE name=$1", ["StatsBomb Open Data"]);
  if (!source.rows[0]) return reply.code(409).send({ error: "import_matches_first", message: "Сначала импортируйте матчи StatsBomb." });
  const sourceId = source.rows[0].id;
  let seen=0, inserted=0;
  for (const externalMatchId of ids) {
    const mapping = await database.query("SELECT internal_id FROM source_records WHERE source_id=$1 AND entity_type='match' AND external_id=$2", [sourceId,String(externalMatchId)]);
    if (!mapping.rows[0]) continue;
    const matchId = mapping.rows[0].internal_id;
    const events = await fetchJson(STATS + "/events/" + externalMatchId + ".json");
    for (const event of events) {
      seen++;
      const eventType = String(event.type?.name ?? "Unknown");
      const playerName = event.player?.name ? String(event.player.name) : null;
      let playerId: number | null = null;
      if (playerName) {
        const knownPlayer = await database.query("SELECT id FROM players WHERE full_name=$1 ORDER BY id LIMIT 1", [playerName]);
        if (knownPlayer.rows[0]) playerId = knownPlayer.rows[0].id;
        else {
          const player = await database.query(
            `INSERT INTO players(full_name,given_name,family_name) VALUES($1,$2,$3) RETURNING id`,
            [playerName, playerName.split(" ").slice(0,-1).join(" ") || null, playerName.split(" ").slice(-1)[0] || null]);
          playerId = player.rows[0].id;
        }
      }
      const teamName = event.team?.name ? String(event.team.name) : null;
      let teamId: number | null = null;
      if (teamName) {
        const team = await database.query("INSERT INTO teams(name,team_type) VALUES($1,'other') ON CONFLICT DO NOTHING RETURNING id",[teamName]);
        teamId = team.rows[0]?.id ?? (await database.query("SELECT id FROM teams WHERE name=$1 ORDER BY id LIMIT 1",[teamName])).rows[0]?.id ?? null;
      }
      const externalEventId = String(event.id ?? event.index ?? seen);
      const prior = await database.query("SELECT id FROM match_events WHERE match_id=$1 AND source_id=$2 AND details->>'external_event_id'=$3 LIMIT 1",[matchId,sourceId,externalEventId]);
      if (prior.rows[0]) {
        await database.query("UPDATE match_events SET minute=$1,event_type=$2,team_id=$3,player_id=$4,details=$5::jsonb WHERE id=$6",
          [event.minute ?? null,eventType,teamId,playerId,JSON.stringify({...event,external_event_id:externalEventId}),prior.rows[0].id]);
      } else {
        await database.query("INSERT INTO match_events(match_id,minute,event_type,team_id,player_id,source_id,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
          [matchId,event.minute ?? null,eventType,teamId,playerId,sourceId,JSON.stringify({...event,external_event_id:externalEventId})]);
        inserted++;
      }
    }
  }
  cache.clear();
  return { status:"success", matchesRequested:ids.length, eventsSeen:seen, eventsInserted:inserted };
});

app.post("/api/v1/admin/migrate", async (request, reply) => {
  if (!process.env.INGEST_TOKEN || request.headers.authorization !== "Bearer " + process.env.INGEST_TOKEN)
    return reply.code(401).send({ error: "unauthorized" });
  const database = db();
  for (const file of ["database/migrations/001_initial.sql", "database/migrations/002_dedup_indexes.sql"]) {
    await database.query(await readFile(file, "utf8"));
  }
  return { status: "migrated" };
});

app.addHook("onClose", async () => { if (pool) await pool.end(); });
try { await app.listen({ port, host: "0.0.0.0" }); }
catch (error) { app.log.error(error); process.exit(1); }
