import { useEffect, useMemo, useState } from "react";
import { fetchMatches, fetchStatsBombEvents, fetchStatsBombWorldCup, searchPlayers, score, type DataSource, type Match, type MatchEvent, type PlayerSearchResult } from "./api";

const leagues = [{ id: "bl1", label: "Бундеслига" }, { id: "bl2", label: "2. Бундеслига" }, { id: "dfb", label: "DFB-Pokal" }, { id: "em", label: "Евро" }, { id: "wm", label: "Чемпионат мира" }];
type View = "Матчи" | "Статистика" | "Источники";
function dateLabel(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Дата неизвестна" : d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function App() {
  const [view, setView] = useState<View>("Матчи");
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

  async function load(nextSource = source) {
    setLoading(true); setError("");
    try {
      const data = nextSource === "statsbomb" ? await fetchStatsBombWorldCup() : await fetchMatches(league, season);
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
    if (match.source !== "statsbomb" || !match.sourceMatchId) return;
    setEventsLoading(true);
    try { setEvents(await fetchStatsBombEvents(match.sourceMatchId)); }
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

    {view === "Матчи" && <main>
      <div className="pagehead"><div><div className="kicker">ОТКРЫТЫЕ ФУТБОЛЬНЫЕ ДАННЫЕ</div><h1>Матчи</h1></div><button className="refresh" onClick={() => void load()} disabled={loading}>{loading ? "Загрузка…" : "↻"}</button></div>
      <div className="source-switch"><button className={source === "openligadb" ? "chosen" : ""} onClick={() => setSource("openligadb")}>OpenLigaDB <small>Турниры Германии</small></button><button className={source === "statsbomb" ? "chosen" : ""} onClick={() => setSource("statsbomb")}>StatsBomb <small>ЧМ-2022 · события</small></button></div>
      {query.trim().length >= 2 && <section className="player-results"><div className="player-results-head"><b>ПОИСК ИГРОКОВ</b><span>{playerSearchLoading ? "поиск…" : players.length + " результатов"}</span></div>{playerSearchError ? <p className="fine">{playerSearchError}. Поиск использует единую базу FootPulse; если PostgreSQL ещё не подключён или не импортирован, результаты недоступны.</p> : !playerSearchLoading && !players.length ? <p className="fine">Игроки по этому запросу не найдены в импортированных данных.</p> : players.map(p => <div className="player-result" key={p.id}><span><b>{p.full_name}</b><small>{p.nationality || "Национальность не указана"} · {p.matches} матчей</small></span><strong>{p.goals} <small>ГОЛЫ</small></strong><strong>{p.assists} <small>ПАСЫ</small></strong></div>)}</section>}
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
      <a href="https://www.football-data.co.uk/" target="_blank" rel="noreferrer"><b>football-data.co.uk</b><span>Исторические результаты и CSV-статистика · следующий источник для импорта</span><i>Доступен для интеграции ↗</i></a>
      <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer"><b>Wikidata</b><span>Справочные данные о клубах, соревнованиях и людях через SPARQL · требует отдельного адаптера</span><i>Доступен для интеграции ↗</i></a>
    </div><p className="fine">Бесплатный доступ не означает одинаковое покрытие, отсутствие лимитов или разрешение на любое повторное распространение. Для каждого источника сохраняем атрибуцию и границы покрытия.</p></main>}

    <footer><span>FOOTPULSE</span><span>ОТКРЫТЫЕ ДАННЫЕ · БЕЗ ВЫМЫШЛЕННОЙ СТАТИСТИКИ</span></footer>

    {selected && <div className="backdrop" onClick={() => setSelected(null)}><section className="modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
      <button className="close" onClick={() => setSelected(null)}>×</button><div className="kicker">{selected.leagueName || "Матч"} · {dateLabel(selected.matchDateTime)}</div><h2>{selected.team1?.teamName} <em>{score(selected)}</em> {selected.team2?.teamName}</h2>
      <div className="modalrule"></div>
      {selected.source === "statsbomb" ? <><div className="eventhead"><b>СОБЫТИЯ МАТЧА</b><span>{eventsLoading ? "загрузка…" : events.length + " событий"}</span></div>{eventsError && <p className="fine">{eventsError}</p>}{!eventsLoading && !eventsError && <div className="eventstats"><div><b>{goalEvents.length}</b><small>голов по событиям</small></div><div><b>{events.filter(e => e.type?.name === "Shot").length}</b><small>ударов</small></div><div><b>{events.filter(e => e.type?.name === "Pass").length}</b><small>передач</small></div></div>}{events.slice(0, 250).filter(e => ["Shot", "Goal Keeper", "Substitution", "Half Start", "Half End", "Own Goal Against"].includes(e.type?.name || "")).map((e, i) => <div className="event" key={e.id || i}><time>{e.minute ?? "—"}′</time><span><b>{e.type?.name || "Событие"}</b><small>{e.player?.name || e.team?.name || "Данные источника"}</small></span><small>{e.shot?.outcome?.name || e.substitution?.replacement?.name || ""}</small></div>)}</> : <p className="fine">OpenLigaDB предоставляет результат и базовые сведения о матче. Подробные события и индивидуальная статистика показываются только при наличии их в подключённом источнике.</p>}
      <a className="source-link" href={selected.source === "statsbomb" ? "https://github.com/statsbomb/open-data" : "https://www.openligadb.de/"} target="_blank" rel="noreferrer">Открыть первоисточник ↗</a>
    </section></div>}
  </div>;
}
