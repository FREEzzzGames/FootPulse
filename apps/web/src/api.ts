export interface Team { teamId?: number; teamName?: string; }
export interface Result { resultTypeID?: number; pointsTeam1?: number; pointsTeam2?: number; }
export interface Match { matchID: number; matchDateTime: string; matchIsFinished: boolean; team1?: Team; team2?: Team; matchResults?: Result[]; leagueName?: string; }
export async function fetchMatches(league: string, season: string): Promise<Match[]> {
 const response = await fetch("https://api.openligadb.de/getmatchdata/" + encodeURIComponent(league) + "/" + encodeURIComponent(season), {headers:{Accept:"application/json"}});
 if (!response.ok) throw new Error("OpenLigaDB HTTP " + response.status);
 const data: unknown = await response.json();
 if (!Array.isArray(data)) throw new Error("Unexpected API response format");
 return data as Match[];
}
export function score(match: Match): string {
 const list = match.matchResults ?? [];
 const result = list.find(x => x.resultTypeID === 2) ?? list.find(x => x.resultTypeID === 1) ?? list[list.length - 1];
 return result && result.pointsTeam1 != null && result.pointsTeam2 != null ? result.pointsTeam1 + " : " + result.pointsTeam2 : "— : —";
}
