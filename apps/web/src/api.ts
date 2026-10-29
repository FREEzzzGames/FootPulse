export interface Team { teamId?: number; teamName?: string; }
export interface Result { resultTypeID?: number; pointsTeam1?: number; pointsTeam2?: number; }
export type DataSource = "openligadb" | "statsbomb";
export interface Match {
  matchID: number;
  matchDateTime: string;
  matchIsFinished: boolean;
  team1?: Team;
  team2?: Team;
  matchResults?: Result[];
  leagueName?: string;
  source: DataSource;
  sourceMatchId?: number;
  homeScore?: number | null;
  awayScore?: number | null;
  competition?: string;
}
export interface MatchEvent {
  id?: string;
  index?: number;
  minute?: number;
  type?: { name?: string };
  team?: { name?: string };
  player?: { name?: string };
  pass?: { recipient?: { name?: string }; outcome?: { name?: string }; end_location?: number[] };
  shot?: { outcome?: { name?: string }; statsbomb_xg?: number };
  substitution?: { replacement?: { name?: string } };
  position?: { name?: string };
  location?: number[];
}
const STATS_BOMB_BASE = "https://raw.githubusercontent.com/statsbomb/open-data/master/data";

export async function fetchMatches(league: string, season: string): Promise<Match[]> {
  const response = await fetch("https://api.openligadb.de/getmatchdata/" + encodeURIComponent(league) + "/" + encodeURIComponent(season), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("OpenLigaDB HTTP " + response.status);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("Неожиданный формат OpenLigaDB");
  return (data as Omit<Match, "source">[]).map(m => ({ ...m, source: "openligadb" }));
}

/** Public StatsBomb Open Data: a fixed, documented sample competition/season, not live coverage. */
export async function fetchStatsBombWorldCup(): Promise<Match[]> {
  const response = await fetch(STATS_BOMB_BASE + "/matches/43/106.json", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("StatsBomb Open Data HTTP " + response.status);
  const rows: any = await response.json();
  if (!Array.isArray(rows)) throw new Error("Неожиданный формат StatsBomb");
  return rows.map((m: any) => ({
    matchID: Number(m.match_id),
    sourceMatchId: Number(m.match_id),
    matchDateTime: String(m.match_date || ""),
    matchIsFinished: true,
    team1: { teamName: String(m.home_team?.home_team_name || "Неизвестная команда") },
    team2: { teamName: String(m.away_team?.away_team_name || "Неизвестная команда") },
    homeScore: typeof m.home_score === "number" && Number.isFinite(m.home_score) ? m.home_score : null,
    awayScore: typeof m.away_score === "number" && Number.isFinite(m.away_score) ? m.away_score : null,
    leagueName: "Чемпионат мира 2022",
    competition: "FIFA World Cup 2022",
    source: "statsbomb" as const,
  }));
}

export async function fetchStatsBombEvents(matchId: number): Promise<MatchEvent[]> {
  const response = await fetch(STATS_BOMB_BASE + "/events/" + encodeURIComponent(String(matchId)) + ".json", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("StatsBomb events HTTP " + response.status);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("Неожиданный формат событий StatsBomb");
  return data as MatchEvent[];
}

export function score(match: Match): string {
  if (match.source === "statsbomb") {
    return match.homeScore == null || match.awayScore == null ? "— : —" : match.homeScore + " : " + match.awayScore;
  }
  const list = match.matchResults ?? [];
  const result = list.find(x => x.resultTypeID === 2) ?? list.find(x => x.resultTypeID === 1) ?? list[list.length - 1];
  return result && result.pointsTeam1 != null && result.pointsTeam2 != null ? result.pointsTeam1 + " : " + result.pointsTeam2 : "— : —";
}

export interface PlayerSearchResult { id:number; full_name:string; given_name?:string|null; family_name?:string|null; nationality?:string|null; matches:number; goals:number; assists:number; }
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://footpulse-api-36vo.onrender.com").replace(/\/+$/, "");

export interface ApiHealth { status: "ok" | "degraded"; database: "connected" | "not_configured" | "unavailable"; timestamp: string; }
export async function fetchApiHealth(): Promise<ApiHealth> {
  const response = await fetch(API_BASE + "/api/health", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  const body = await response.json().catch(() => ({})) as Partial<ApiHealth> & { message?: string };
  if (!response.ok) throw new Error(body.message || "API health HTTP " + response.status);
  if (body.status !== "ok" && body.status !== "degraded") throw new Error("Unexpected API health response");
  return { status: body.status, database: body.database || "unavailable", timestamp: body.timestamp || "" };
}
export async function searchPlayers(query:string):Promise<PlayerSearchResult[]> {
  const response = await fetch(API_BASE + "/api/v1/players?q=" + encodeURIComponent(query) + "&limit=12", {headers:{Accept:"application/json"}});
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(body.message || body.error || "Player database unavailable");
  return Array.isArray(body.data) ? body.data as PlayerSearchResult[] : [];
}
