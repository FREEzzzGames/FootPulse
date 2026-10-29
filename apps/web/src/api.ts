export interface Team { teamId?: number; teamName?: string; }
export interface Result { resultTypeID?: number; pointsTeam1?: number; pointsTeam2?: number; }
export type DataSource = "openligadb" | "statsbomb" | "archive";
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


export interface OpenLigaLeague { leagueId: number; leagueName: string; leagueShortcut: string; leagueSeason: string; }
export async function fetchAvailableLeagues(season: string): Promise<OpenLigaLeague[]> {
  const response = await fetch("https://api.openligadb.de/getavailableleagues/" + encodeURIComponent(season), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("OpenLigaDB leagues HTTP " + response.status);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("Неожиданный формат списка лиг OpenLigaDB");
  return rows.filter((row: any) => /fußball|fussball|football|soccer/i.test(String(row?.sport?.sportName ?? "")))
    .filter((row: any) => row?.leagueShortcut && row?.leagueName)
    .map((row: any) => ({
      leagueId: Number(row.leagueId),
      leagueName: String(row.leagueName),
      leagueShortcut: String(row.leagueShortcut),
      leagueSeason: String(row.leagueSeason ?? season),
    }))
    .sort((a: OpenLigaLeague, b: OpenLigaLeague) => a.leagueName.localeCompare(b.leagueName, "ru"));
}

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
  if (match.source !== "openligadb") {
    return match.homeScore == null || match.awayScore == null ? "— : —" : match.homeScore + " : " + match.awayScore;
  }
  const list = match.matchResults ?? [];
  const result = list.find(x => x.resultTypeID === 2) ?? list.find(x => x.resultTypeID === 1) ?? list[list.length - 1];
  return result && result.pointsTeam1 != null && result.pointsTeam2 != null ? result.pointsTeam1 + " : " + result.pointsTeam2 : "— : —";
}

export interface PlayerSearchResult { id:number; full_name:string; given_name?:string|null; family_name?:string|null; nationality?:string|null; matches:number; goals:number; assists:number; }
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://footpulse-api-36vo.onrender.com").replace(/\/+$/, "");


export async function fetchArchiveMatches(): Promise<Match[]> {
  const response = await fetch(API_BASE + "/api/v1/matches?limit=100&offset=0", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({})) as { data?: Array<Record<string, unknown>>; message?: string; error?: string };
  if (!response.ok) throw new Error(body.message || body.error || "Архив FootPulse недоступен");
  if (!Array.isArray(body.data)) throw new Error("API вернул неожиданный формат архива");
  return body.data.map(row => ({
    matchID: Number(row.id),
    sourceMatchId: Number(row.id),
    matchDateTime: String(row.match_date || ""),
    matchIsFinished: row.status === "finished",
    team1: { teamName: String(row.home_team || "Команда 1") },
    team2: { teamName: String(row.away_team || "Команда 2") },
    homeScore: typeof row.home_score === "number" ? row.home_score : row.home_score == null ? null : Number(row.home_score),
    awayScore: typeof row.away_score === "number" ? row.away_score : row.away_score == null ? null : Number(row.away_score),
    leagueName: String(row.competition || "Архив FootPulse"),
    competition: String(row.competition || ""),
    source: "archive" as const,
  }));
}

export async function fetchArchiveEvents(matchId: number): Promise<MatchEvent[]> {
  const response = await fetch(API_BASE + "/api/v1/matches/" + encodeURIComponent(String(matchId)) + "/events", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({})) as { data?: Array<Record<string, unknown>>; message?: string; error?: string };
  if (!response.ok) throw new Error(body.message || body.error || "События матча недоступны");
  if (!Array.isArray(body.data)) throw new Error("API вернул неожиданный формат событий");
  return body.data.map(row => {
    const details = row.details && typeof row.details === "object" ? row.details as Record<string, any> : {};
    const type = details.type && typeof details.type === "object" ? details.type : { name: String(row.event_type || "Событие") };
    return {
      id: String(row.id ?? details.id ?? ""),
      index: Number(details.index ?? 0),
      minute: row.minute == null ? undefined : Number(row.minute),
      type,
      team: { name: String(row.team || "") },
      player: { name: String(row.player || "") },
      location: Array.isArray(details.location) ? details.location as number[] : undefined,
      pass: details.pass && typeof details.pass === "object" ? details.pass : undefined,
      shot: details.shot && typeof details.shot === "object" ? details.shot : undefined,
      substitution: details.substitution && typeof details.substitution === "object" ? details.substitution : undefined,
      position: details.position && typeof details.position === "object" ? details.position : undefined,
    };
  });
}

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
