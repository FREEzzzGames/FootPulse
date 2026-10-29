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
  pass?: { recipient?: { name?: string }; outcome?: { name?: string } };
  shot?: { outcome?: { name?: string }; statsbomb_xg?: number };
  substitution?: { replacement?: { name?: string } };
  position?: { name?: string };
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
    homeScore: Number.isFinite(Number(m.home_score)) ? Number(m.home_score) : null,
    awayScore: Number.isFinite(Number(m.away_score)) ? Number(m.away_score) : null,
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
