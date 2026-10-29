import { useEffect, useMemo, useState } from "react";
import { fetchApiHealth, fetchArchiveEvents, fetchArchiveMatches, fetchAvailableLeagues, fetchGoalGetters, fetchLeagueTable, fetchMatches, fetchStatsBombEvents, fetchStatsBombWorldCup, searchPlayers, score, type ApiHealth, type DataSource, type GoalGetter, type LeagueStanding, type Match, type MatchEvent, type OpenLigaLeague, type PlayerSearchResult } from "./api";

const leagues = [{ id: "bl1", label: "Бундеслига" }, { id: "bl2", label: "2. Бундеслига" }, { id: "dfb", label: "DFB-Pokal" }, { id: "em", label: "Евро" }, { id: "wm", label: "Чемпионат мира" }];
type View = "Матчи" | "Статистика" | "Источники";
function dateLabel(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Дата неизвестна" : d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function TacticalReplay({ events }: { events: MatchEvent[] }) {
  const located = useMemo(() => events.filter(e => Array.isArray(e.location) && e.location.length >= 2), [events]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setIndex(0); setPlaying(false); }, [located]);
  useEffect(() => {
    if (!playing || located.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex(current => Math.min(located.length - 1, current + 1));
    }, 850);
    return () => window.clearInterval(timer);
  }, [playing, located.length]);
  useEffect(() => {
    if (playing && index >= located.length - 1) setPlaying(false);
  }, [playing, index, located.length]);
  if (!located.length) return <div className="tactical-empty">В выбранном матче нет координат событий для графического разбора.</div>;
  const start = Math.max(0, index - 79);
  const visible = located.slice(start, index + 1);
  const current = located[index];
  const point = (location: number[]) => ({ x: Math.max(0, Math.min(120, location[0])) * 5, y: (80 - Math.max(0, Math.min(80, location[1]))) * 5 });
  const label = current?.type?.name || "Событие";
  return <section className="tactical">
    <div className="tactical-head"><b>ГРАФИЧЕСКИЙ РАЗБОР</b><span>{index + 1} / {located.length}</span></div>
    <svg className="tactical-pitch" viewBox="0 0 600 400" role="img" aria-label="Футбольное поле с координатами реальных событий матча">
      <rect x="1" y="1" width="598" height="398" rx="4" className="pitch-bg"/>
      <g className="pitch-lines">
        <rect x="18" y="18" width="564" height="364"/>
        <line x1="300" y1="18" x2="300" y2="382"/>
        <circle cx="300" cy="200" r="48"/>
        <circle cx="300" cy="200" r="3" className="pitch-dot"/>
        <rect x="18" y="112" width="90" height="176"/>
        <rect x="18" y="150" width="35" height="100"/>
        <rect x="492" y="112" width="90" height="176"/>
        <rect x="547" y="150" width="35" height="100"/>
      </g>
      {visible.map((event, localIndex) => {
        const i = start + localIndex;
        const from = point(event.location!);
        const end = event.type?.name === "Pass" && Array.isArray(event.pass?.end_location) && event.pass!.end_location!.length >= 2 ? point(event.pass!.end_location!) : null;
        const active = i === index;
        return <g key={event.id || i} className={active ? "tactical-event active" : "tactical-event"}>
          {end && <line x1={from.x} y1={from.y} x2={end.x} y2={end.y} className="tactical-pass"/>}
          {end && <circle cx={end.x} cy={end.y} r="3" className="tactical-destination"/>}
          <circle cx={from.x} cy={from.y} r={active ? 7 : 4} className={event.type?.name === "Shot" ? "tactical-shot" : "tactical-marker"}/>
        </g>;
      })}
    </svg>
    <div className="tactical-current"><span className={label === "Shot" ? "tactical-current-dot shot" : "tactical-current-dot"}></span><b>{label}</b><span>{current?.player?.name || current?.team?.name || "Игрок не указан"}</span><time>{current?.minute ?? "—"}′</time></div>
    <div className="tactical-controls">
      <button type="button" onClick={() => { setIndex(0); setPlaying(false); }} aria-label="В начало">↤</button>
      <button type="button" onClick={() => setPlaying(value => !value)} disabled={located.length < 2}>{playing ? "Ⅱ Пауза" : "▶ Воспроизвести"}</button>
      <button type="button" onClick={() => { setPlaying(false); setIndex(value => Math.min(located.length - 1, value + 1)); }} aria-label="Следующее событие" disabled={index >= located.length - 1}>↦</button>
    </div>
    <input className="tactical-range" type="range" min="0" max={located.length - 1} value={index} aria-label="Положение в последовательности событий" onChange={e => { setPlaying(false); setIndex(Number(e.target.value)); }}/>
    <div className="tactical-footnote">Координаты и последовательность взяты из StatsBomb Open Data. Это графическая визуализация событий, не видеозапись матча.</div>
  </section>;
}

export function App() {
  const [view, setView] = useState<View>("Матчи");
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null);
  const [apiHealthError, setApiHealthError] = useState("");
  const [source, setSource] = useState<DataSource>("openligadb");
  const [league, setLeague] = useState("bl1");
  const [season, setSeason] = useState("2026");
  const [availableLeagues, setAvailableLeagues] = useState<OpenLigaLeague[]>([]);
  const [leagueLoadError, setLeagueLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  const [selected, setSelected] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [players, setPlayers] = useState<PlayerSearchResult[]>([]);
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);
  const [playerSearchError, setPlayerSearchError] = useState("");
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [goalGetters, setGoalGetters] = useState<GoalGetter[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsErrors, setStatsErrors] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setLeagueLoadError("");
    void fetchAvailableLeagues(season).then(rows => {
      if (!active) return;
      setAvailableLeagues(rows);
      setLeague(current => rows.some(item => item.leagueShortcut === current) ? current : (rows[0]?.leagueShortcut ?? current));
    }).catch(error => {
      if (active) {
        setAvailableLeagues([]);
        setLeagueLoadError(error instanceof Error ? error.message : "Список лиг недоступен");
      }
    });
    return () => { active = false; };
  }, [season]);

  useEffect(() => {
    let active = true;
    const check = () => void fetchApiHealth().then(value => { if (active) { setApiHealth(value); setApiHealthError(""); } }).catch(error => { if (active) { setApiHealth(null); setApiHealthError(error instanceof Error ? error.message : "API недоступен"); } });
    check();
    const timer = window.setInterval(check, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  async function load(nextSource = source) {
    setLoading(true); setError("");
    try {
      const data = nextSource === "statsbomb" ? await fetchStatsBombWorldCup() : nextSource === "archive" ? await fetchArchiveMatches() : await fetchMatches(league, season);
      data.sort((a, b) => new Date(b.matchDateTime).getTime() - new Date(a.matchDateTime).getTime());
      setMatches(data);
      setUpdated(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки источника");
      setMatches([]);
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(source); }, [source, league, season]);

  async function openMatch(match: Match) {
    setSelected(match); setEvents([]); setEventsError("");
    if (match.source === "openligadb" || !match.sourceMatchId) return;
    setEventsLoading(true);
    try { setEvents(match.source === "archive" ? await fetchArchiveEvents(match.sourceMatchId) : await fetchStatsBombEvents(match.sourceMatchId)); }
    catch (e) { setEventsError(e instanceof Error ? e.message : "Не удалось загрузить события"); }
    finally { setEventsLoading(false); }
  }

  const filtered = useMemo(() => matches.filter(m => [m.team1?.teamName, m.team2?.teamName, m.leagueName].join(" ").toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"))), [matches, query]);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setPlayers([]); setPlayerSearchError(""); setPlayerSearchLoading(false); return; }
    let active = true;
    setPlayerSearchLoading(true); setPlayerSearchError("");
    const timer = setTimeout(() => {
      void searchPlayers(term).then(rows => { if (active) setPlayers(rows); })
        .catch(error => { if (active) { setPlayers([]); setPlayerSearchError(error instanceof Error ? error.message : "База игроков недоступна"); } })
        .finally(() => { if (active) setPlayerSearchLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);
  useEffect(() => {
    if (view !== "Статистика") return;
    let active = true;
    setStatsLoading(true);
    setStatsErrors([]);
    Promise.allSettled([fetchLeagueTable(league, season), fetchGoalGetters(league, season)]).then(results => {
      if (!active) return;
      const errors: string[] = [];
      if (results[0].status === "fulfilled") setStandings(results[0].value);
      else { setStandings([]); errors.push("Таблица: " + (results[0].reason instanceof Error ? results[0].reason.message : "источник недоступен")); }
      if (results[1].status === "fulfilled") setGoalGetters(results[1].value);
      else { setGoalGetters([]); errors.push("Бомбардиры: " + (results[1].reason instanceof Error ? results[1].reason.message : "источник недоступен")); }
      setStatsErrors(errors);
    }).finally(() => { if (active) setStatsLoading(false); });
    return () => { active = false; };
  }, [view, league, season]);

  const finished = matches.filter(m => m.matchIsFinished).length;
  const goalEvents = events.filter(e => e.type?.name === "Shot" && e.shot?.outcome?.name === "Goal");
  return <div className="app">
    <header className="topbar">
      <button className="wordmark" onClick={() => { setView("Матчи"); setQuery(""); }} aria-label="FootPulse — на главную"><span className="pulse">F</span><span>footpulse</span></button>
      <nav className="nav">{(["Матчи", "Статистика", "Источники"] as View[]).map(v => <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v}</button>)}</nav>
      <label className="search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Команда или игрок…" /></label>
    </header>
    <div className={"system-status " + (apiHealthError ? "system-status-error" : apiHealth?.database === "connected" ? "system-status-ok" : "system-status-warn")} role="status" aria-live="polite">
      <span className="system-status-dot" />
      {apiHealthError ? "API недоступен: " + apiHealthError : apiHealth?.database === "connected" && apiHealth.schema === "ready" ? "API, PostgreSQL и схема архива готовы" : apiHealth?.database === "connected" && apiHealth.schema === "missing" ? "PostgreSQL подключён, но схема FootPulse не создана — нужен запуск миграций" : apiHealth?.database === "not_configured" ? "API работает, PostgreSQL не настроен — поиск игроков и архив недоступны" : apiHealth?.database === "unavailable" ? "PostgreSQL недоступен — поиск игроков и архив временно недоступны" : "Проверка API…"}
    </div>

    {view === "Матчи" && <main>
      <div className="pagehead"><div><div className="kicker">ОТКРЫТЫЕ ФУТБОЛЬНЫЕ ДАННЫЕ</div><h1>Матчи</h1></div><button className="refresh" onClick={() => void load()} disabled={loading}>{loading ? "Загрузка…" : "↻"}</button></div>
      <div className="source-switch"><button className={source === "openligadb" ? "chosen" : ""} onClick={() => setSource("openligadb")}>OpenLigaDB <small>Турниры Германии</small></button><button className={source === "statsbomb" ? "chosen" : ""} onClick={() => setSource("statsbomb")}>StatsBomb <small>ЧМ-2022 · события</small></button><button className={source === "archive" ? "chosen" : ""} onClick={() => setSource("archive")}>Архив <small>PostgreSQL · импорт</small></button></div>
      {query.trim().length >= 2 && <section className="player-results"><div className="player-results-head"><b>ПОИСК ИГРОКОВ</b><span>{playerSearchLoading ? "поиск…" : players.length + " результатов"}</span></div>{playerSearchError ? <p className="fine">{playerSearchError}. Поиск использует единую базу FootPulse; если PostgreSQL ещё не подключён или не импортирован, результаты недоступны.</p> : !playerSearchLoading && !players.length ? <p className="fine">Игроки по этому запросу не найдены в импортированных данных.</p> : players.map(p => <div className="player-result" key={p.id}><span><b>{p.full_name}</b><small>{p.nationality || "Национальность не указана"} · {p.matches} матчей</small></span><strong>{p.goals} <small>ГОЛЫ</small></strong><strong>{p.assists} <small>ПАСЫ</small></strong></div>)}</section>}
      {source === "openligadb" && leagueLoadError && <p className="fine">Не удалось обновить каталог лиг ({leagueLoadError}); используется резервный список.</p>}
      {source === "archive" && <p className="archive-note">Архив из PostgreSQL FootPulse. Здесь отображаются только импортированные матчи; пустой архив не заполняется демонстрационными данными.</p>}
      {source === "openligadb" && <div className="filters"><select aria-label="Турнир" value={league} onChange={e => setLeague(e.target.value)}>{(availableLeagues.length ? availableLeagues.map(l => ({ id: l.leagueShortcut, label: l.leagueName })) : leagues).map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select><select aria-label="Сезон" value={season} onChange={e => setSeason(e.target.value)}>{["2026", "2025", "2024", "2023", "2022", "2021", "2020"].map(y => <option key={y}>{y}</option>)}</select></div>}
      <div className="statsline"><span>{filtered.length} матчей</span><span>{finished} завершено</span><span className="live-dot">{loading ? "обновление" : error ? "источник недоступен" : "данные загружены"}</span></div>
      {error ? <div className="empty"><b>Не удалось получить данные</b><p>{error}</p><button onClick={() => void load()}>Повторить</button></div> : loading ? <div className="empty">Загружаем данные из выбранного источника…</div> : !filtered.length ? <div className="empty">Совпадений нет. Измените запрос или выберите другой турнир.</div> :
        <div className="matchlist">{filtered.slice(0, 100).map(m => <button className="match" key={m.source + m.matchID} onClick={() => void openMatch(m)}>
          <span className="matchdate">{m.source === "statsbomb" ? dateLabel(m.matchDateTime).split(",")[0] : dateLabel(m.matchDateTime)}</span>
          <span className="teams"><b>{m.team1?.teamName || "Команда 1"}</b><b>{m.team2?.teamName || "Команда 2"}</b><small>{m.leagueName || leagues.find(l => l.id === league)?.label}</small></span>
          <strong className="score">{score(m)}</strong><span className="arrow">↗</span>
        </button>)}</div>}
      <div className="footnote">Источник: {source === "statsbomb" ? "StatsBomb Open Data" : "OpenLigaDB"}{updated && " · обновлено " + updated}. Доступность зависит от покрытия источника.</div>
    </main>}

    {view === "Статистика" && <main>
      <div className="pagehead"><div><div className="kicker">LEAGUE DATA · OPENLIGADB</div><h1>Статистика</h1></div><button className="refresh" type="button" onClick={() => { setView("Матчи"); setSource("statsbomb"); }} aria-label="Открыть события ЧМ-2022">↗</button></div>
      <section className="panel">
        <div className="stats-filters">
          <select aria-label="Лига для статистики" value={league} onChange={e => setLeague(e.target.value)}>{(availableLeagues.length ? availableLeagues.map(l => ({ id: l.leagueShortcut, label: l.leagueName })) : leagues).map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
          <select aria-label="Сезон статистики" value={season} onChange={e => setSeason(e.target.value)}>{["2026", "2025", "2024", "2023", "2022", "2021", "2020"].map(y => <option key={y}>{y}</option>)}</select>
        </div>
        <div className="stats-section-head"><h2>Турнирная таблица</h2><span>{statsLoading ? "обновление…" : standings.length ? standings.length + " команд" : "нет данных"}</span></div>
        {statsErrors.some(e => e.startsWith("Таблица:")) && <p className="fine">{statsErrors.find(e => e.startsWith("Таблица:"))}</p>}
        {!statsLoading && !standings.length && !statsErrors.some(e => e.startsWith("Таблица:")) && <p className="fine">Источник не публикует таблицу для выбранного турнира или сезона.</p>}
        {standings.length > 0 && <div className="table-wrap"><table className="league-table"><thead><tr><th>#</th><th>Команда</th><th>И</th><th>В</th><th>Н</th><th>П</th><th>Мячи</th><th>±</th><th>Очки</th></tr></thead><tbody>{standings.map((team,index) => <tr key={team.teamInfoId || team.teamName}><td>{index+1}</td><td>{team.teamName}</td><td>{team.matches}</td><td>{team.won}</td><td>{team.draw}</td><td>{team.lost}</td><td>{team.goals}:{team.opponentGoals}</td><td>{team.goalDiff > 0 ? "+" : ""}{team.goalDiff}</td><td><b>{team.points}</b></td></tr>)}</tbody></table></div>}
        <div className="stats-section-head scorers-head"><h2>Бомбардиры</h2><span>{statsLoading ? "обновление…" : goalGetters.length ? goalGetters.length + " игроков" : "нет данных"}</span></div>
        {statsErrors.some(e => e.startsWith("Бомбардиры:")) && <p className="fine">{statsErrors.find(e => e.startsWith("Бомбардиры:"))}</p>}
        {goalGetters.length > 0 && <div className="scorers">{goalGetters.slice(0,20).map((player,index)=><div className="scorer-row" key={player.goalGetterId || player.goalGetterName}><span className="scorer-rank">{index+1}</span><b>{player.goalGetterName}</b><strong>{player.goalCount}</strong></div>)}</div>}
      </section>
      <section className="panel"><h2>Графические разборы матчей</h2><p>Координаты ударов и передач доступны для опубликованных матчей StatsBomb. Запись событий открывается из карточки матча.</p><div className="statcards"><div><b>ЧМ-2022</b><small>Открытый набор</small></div><div><b>События</b><small>Удары, передачи, замены</small></div><div><b>Графический повтор</b><small>По координатам событий</small></div></div><button onClick={() => { setSource("statsbomb"); setView("Матчи"); }}>Открыть матчи ЧМ-2022 ↗</button><p className="fine">Покрытие зависит от открытого набора. Для OpenLigaDB доступны результаты и таблицы, но не полные координаты событий.</p></section>
    </main>}

    {view === "Источники" && <main><div className="pagehead"><div><div className="kicker">DATA REGISTRY</div><h1>Источники</h1></div></div><div className="registry">
      <a href="https://www.openligadb.de/" target="_blank" rel="noreferrer"><b>OpenLigaDB</b><span>Матчи и результаты · публичный API · без ключа</span><i>Подключён ↗</i></a>
      <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noreferrer"><b>StatsBomb Open Data</b><span>События, удары, передачи, составы для выбранных соревнований · открытый набор</span><i>Подключён ↗</i></a>
      <a href="https://www.football-data.co.uk/" target="_blank" rel="noreferrer"><b>football-data.co.uk</b><span>CSV-архивы: только личное/академическое использование, ручная загрузка или лёгкий доступ не чаще 2 раз в неделю</span><i>Не подключён автоматически ↗</i></a>
      <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer"><b>Wikidata</b><span>Справочные данные о клубах, соревнованиях и людях через SPARQL · требует отдельного адаптера</span><i>Доступен для интеграции ↗</i></a>
    </div><p className="fine">Бесплатный доступ не означает одинаковое покрытие, отсутствие лимитов или разрешение на любое повторное распространение. Для каждого источника сохраняем атрибуцию и границы покрытия.</p></main>}

    <footer><span>FOOTPULSE</span><span>ОТКРЫТЫЕ ДАННЫЕ · БЕЗ ВЫМЫШЛЕННОЙ СТАТИСТИКИ</span></footer>

    {selected && <div className="backdrop" onClick={() => setSelected(null)}><section className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
      <button className="close" onClick={() => setSelected(null)}>×</button><div className="kicker">{selected.leagueName || "Матч"} · {dateLabel(selected.matchDateTime)}</div><h2>{selected.team1?.teamName} <em>{score(selected)}</em> {selected.team2?.teamName}</h2>
      <div className="modalrule"></div>
      {selected.source !== "openligadb" ? <><div className="eventhead"><b>СОБЫТИЯ МАТЧА</b><span>{eventsLoading ? "загрузка…" : events.length + " событий"}</span></div>{eventsError && <p className="fine">{eventsError}</p>}{!eventsLoading && !eventsError && events.length > 0 && <TacticalReplay events={events} />}{!eventsLoading && !eventsError && <div className="eventstats"><div><b>{goalEvents.length}</b><small>голов по событиям</small></div><div><b>{events.filter(e => e.type?.name === "Shot").length}</b><small>ударов</small></div><div><b>{events.filter(e => e.type?.name === "Pass").length}</b><small>передач</small></div></div>}{events.slice(0, 250).filter(e => ["Shot", "Goal Keeper", "Substitution", "Half Start", "Half End", "Own Goal Against"].includes(e.type?.name || "")).map((e, i) => <div className="event" key={e.id || i}><time>{e.minute ?? "—"}′</time><span><b>{e.type?.name || "Событие"}</b><small>{e.player?.name || e.team?.name || "Данные источника"}</small></span><small>{e.shot?.outcome?.name || e.substitution?.replacement?.name || ""}</small></div>)}</> : <p className="fine">OpenLigaDB предоставляет результат и базовые сведения о матче. Подробные события и индивидуальная статистика показываются только при наличии их в подключённом источнике.</p>}
      <a className="source-link" href={selected.source === "openligadb" ? "https://www.openligadb.de/" : "https://github.com/statsbomb/open-data"} target="_blank" rel="noreferrer">Открыть первоисточник ↗</a>
    </section></div>}
  </div>;
}
