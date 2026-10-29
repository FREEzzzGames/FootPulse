import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import pg from "pg";

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 3000);
const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
    })
  : null;

await app.register(cors, { origin: process.env.CORS_ORIGIN?.split(",") ?? true });

app.get("/api/health", async () => ({
  status: "ok",
  service: "footpulse-api",
  databaseConfigured: Boolean(pool),
  timestamp: new Date().toISOString(),
}));

app.get("/api/v1/matches", async (request, reply) => {
  if (!pool) {
    return reply.code(503).send({
      error: "database_not_configured",
      message: "Configure DATABASE_URL and apply database/migrations/001_initial.sql.",
    });
  }

  const query = request.query as { limit?: string; offset?: string; from?: string; to?: string };
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));
  const offset = Math.max(0, Number(query.offset ?? 0) || 0);
  const values: unknown[] = [];
  const filters: string[] = [];

  if (query.from) {
    values.push(query.from);
    filters.push("match_date >= $" + values.length);
  }
  if (query.to) {
    values.push(query.to);
    filters.push("match_date < ($" + values.length + "::date + INTERVAL '1 day')");
  }

  values.push(limit);
  const limitParam = values.length;
  values.push(offset);
  const offsetParam = values.length;
  const where = filters.length ? "WHERE " + filters.join(" AND ") : "";
  const sql =
    "SELECT id, match_date, status, home_score, away_score, home_team_id, away_team_id, competition_id, source_updated_at " +
    "FROM matches " + where + " ORDER BY match_date DESC LIMIT $" + limitParam + " OFFSET $" + offsetParam;

  const result = await pool.query(sql, values);
  return { data: result.rows, pagination: { limit, offset } };
});

app.addHook("onClose", async () => {
  if (pool) await pool.end();
});

try {
  await app.listen({ port, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
