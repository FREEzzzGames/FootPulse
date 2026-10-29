import { useEffect, useMemo, useState } from "react";
import { fetchApiHealth, fetchArchiveEvents, fetchArchiveMatches, fetchMatches, fetchStatsBombEvents, fetchStatsBombWorldCup, searchPlayers, score, type ApiHealth, type DataSource, type Match, type MatchEvent, type PlayerSearchResult } from "./api";

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
  const visible = located.slice(0, index + 1);
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
      {visible.map((event, i) => {
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
      {apiHealthError ? "API недоступен: " + apiHealthError : apiHealth?.database === "connected" ? "Сервер API и PostgreSQL подключены" : apiHealth?.database === "not_configured" ? "API работает, PostgreSQL не настроен — серверный поиск игроков и архив недоступны" : apiHealth?.database === "unavailable" ? "PostgreSQL недоступен — серверный поиск игроков и архив временно недоступны" : "Проверка API…"}
    </div>

    {view === "Матчи" && <main>
      <div className="pagehead"><div><div className="kicker">ОТКРЫТЫЕ ФУТБОЛЬНЫЕ ДАННЫЕ</div><h1>Матчи</h1></div><button className="refresh" onClick={() => void load()} disabled={loading}>{loading ? "Загрузка…" : "↻"}</button></div>
      <div className="source-switch"><button className={source === "openligadb" ? "chosen" : ""} onClick={() => setSource("openligadb")}>OpenLigaDB <small>Турниры Германии</small></button><button className={source === "statsbomb" ? "chosen" : ""} onClick={() => setSource("statsbomb")}>StatsBomb <small>ЧМ-2022 · события</small></button><button className={source === "archive" ? "chosen" : ""} onClick={() => setSource("archive")}>Архив <small>PostgreSQL · импорт</small></button></div>
      {query.trim().length >= 2 && <section className="player-results"><div className="player-results-head"><b>ПОИСК ИГРОКОВ</b><span>{playerSearchLoading ? "поиск…" : players.length + " результатов"}</span></div>{playerSearchError ? <p className="fine">{playerSearchError}. Поиск использует единую базу FootPulse; если PostgreSQL ещё не подключён или не импортирован, результаты недоступны.</p> : !playerSearchLoading && !players.length ? <p className="fine">Игроки по этому запросу не найдены в импортированных данных.</p> : players.map(p => <div className="player-result" key={p.id}><span><b>{p.full_name}</b><small>{p.nationality || "Национальность не указана"} · {p.matches} матчей</small></span><strong>{p.goals} <small>ГОЛЫ</small></strong><strong>{p.assists} <small>ПАСЫ</small></strong></div>)}</section>}
      {source === "archive" && <p className="archive-note">Архив из PostgreSQL FootPulse. Здесь отображаются только импортированные матчи; пустой архив не заполняется демонстрационными данными.</p>}
      {source === "openligadb" && <div className="filters"><select aria-label="Турнир" value={league} onChange={e => setLeague(e.target.value)}>{leagues.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select><select aria-label="Сезон" value={season} onChange={e => setSeason(e.target.value)}>{["2026", "2025", "2024", "2023", "2022", "2021", "2020"].map(y => <option key={y}>{y}</option>)}</select></div>}
      <div className="statsline"><span>{filtered.length} матчей</span><span>{finished} завершено</span><span className="live-dot">{loading ? "обновление" : error ? "источник недоступен" : "данные загружены"}</span></div>
      {error ? <div className="empty"><b>Не удалось получить данные</b><p>{error}</p><button onClick={() => void load()}>Повторить</button></div> : loading ? <div className="empty">Загружаем данные из выбранного источника…</div> : !filtered.length ? <div className="empty">Совпадений нет. Измените запрос или выберите другой турнир.</div> :
        <div className="matchlist">{filtered.slice(0, 100).map(m => <button className="match" key={m.source + m.matchID} onClick={() => void openMatch(m)}>
          <span className="matchdate">{m.source === "statsbomb" ? dateLabel(m.matchDateTime).split(",")[0] : dateLabel(m.matchDateTime)}</span>
          <span className="teams"><b>{m.team1?.teamName || "Команда 1"}</b><b>{m.team2?.teamName || "Команда 2"}</b><small>{m.leagueName || leagues.find(l => l.id === league)?.label}</small></span>
          <strong className="score">{score(m)}</strong><span className="arrow">↗</span>
        </button>)}</div>}
      <div className="footnote">Источник: {source === "statsbomb" ? "StatsBomb Open Data" : "OpenLigaDB"}{updated && " · обновлено " + updated}. Доступность зависит от покрытия источника.</div>
    </main>}

    {view === "Статистика" && <main><div className="pagehead"><div><div className="kicker">EVENT DATA</div><h1>Статистика</h1></div></div><section className="panel"><h2>StatsBomb Open Data</h2><p>Открытые события матчей выбранных соревнований. Для первого подключённого набора доступны матчи чемпионата мира 2022 года и события матча: удары, голы, передачи, замены и позиции.</p><div className="statcards"><div><b>ЧМ-2022</b><small>Соревнование</small></div><div><b>События</b><small>Детали матча</small></div><div><b>Бесплатно</b><small>Публичный набор данных</small></div></div><button onClick={() => { setSource("statsbomb"); setView("Матчи"); }}>Открыть матчи ЧМ-2022 ↗</button><p className="fine">Это не полная база всех лиг и сезонов. Набор данных ограничен соревнованиями, опубликованными StatsBomb Open Data.</p></section></main>}

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
