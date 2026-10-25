/**
 * XGaming — Ladder vs Ranked/Unranked. Classic layout: XChat lobbies are a third sub-tab. Stream layout: same lobbies in
 * a column beside the main tab content inside the center panel. Rank art: `public/xgaming/ranks/`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

export type XGamingTab = "ladder" | "servers" | "xchat";

function rankAsset(filename: string): string {
  return `/xgaming/ranks/${encodeURIComponent(filename)}`;
}

export function readXGamingTabFromUrl(): XGamingTab {
  const v = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("xgtab") : null;
  if (v === "servers") return "servers";
  if (v === "xchat") return "xchat";
  return "ladder";
}

const SKILL_RANKS: { id: string; name: string; file: string; xpRange: string }[] = [
  { id: "recruit", name: "Recruit", file: "recruit.jpg", xpRange: "0 – 499 XP" },
  { id: "private", name: "Private", file: "private.jpg", xpRange: "500 – 1,499 XP" },
  { id: "corporal", name: "Corporal", file: "corporal.jpg", xpRange: "1,500 – 3,499 XP" },
  { id: "sergeant", name: "Sergeant", file: "sergeant.jpg", xpRange: "3,500 – 6,999 XP" },
  { id: "staff-sergeant", name: "Staff Sergeant", file: "staff sergeant.jpg", xpRange: "7,000 – 12,499 XP" },
  { id: "lieutenant", name: "Lieutenant", file: "Lieutenant.jpg", xpRange: "12,500 – 20,999 XP" },
  { id: "captain", name: "Captain", file: "Captain.jpg", xpRange: "21,000 – 35,999 XP" },
  { id: "major", name: "Major", file: "Major Gold.jpg", xpRange: "36,000 – 60,999 XP" },
  { id: "colonel", name: "Colonel", file: "Colonel.jpg", xpRange: "61,000 – 99,999 XP" },
  { id: "legend", name: "Legend", file: "Legend.jpg", xpRange: "100,000+ XP" }
];

type LadderPlayer = { handle: string; seed: number };
type LadderMatch = { a: LadderPlayer; b: LadderPlayer; winner: "a" | "b" };
type LadderTournament = {
  id: string;
  title: string;
  blurb: string;
  /** "Live" / "Check-ins closed" etc. */
  statusLine: string;
  final: LadderMatch;
  semis: LadderMatch[];
};

const LADDER_TOURNAMENTS: LadderTournament[] = [
  {
    id: "q3-osp-winter",
    title: "Quake III Arena · OSP 1v1 Winter Open",
    blurb: "Single elimination · BO3 finals (mock). Active bracket placeholder — wire to your match service.",
    statusLine: "Live · finals complete (demo)",
    final: {
      a: { handle: "railw0lf", seed: 1 },
      b: { handle: "fragLimit", seed: 2 },
      winner: "b"
    },
    semis: [
      { a: { handle: "railw0lf", seed: 1 }, b: { handle: "pingFairy", seed: 4 }, winner: "a" },
      { a: { handle: "fragLimit", seed: 2 }, b: { handle: "zeroKelvin", seed: 3 }, winner: "a" }
    ]
  },
  {
    id: "cs16-thursday-mix",
    title: "Counter-Strike 1.6 · Thursday 5v5 Mix",
    blurb: "Squad tags as roster labels until you bind real teams. Same ladder shell for multi-game use.",
    statusLine: "Live · semifinals (demo)",
    final: {
      a: { handle: "clan_dust_doctors", seed: 1 },
      b: { handle: "inferno_pickup", seed: 2 },
      winner: "a"
    },
    semis: [
      { a: { handle: "clan_dust_doctors", seed: 1 }, b: { handle: "nuke_rats", seed: 4 }, winner: "a" },
      { a: { handle: "inferno_pickup", seed: 2 }, b: { handle: "train_ok", seed: 3 }, winner: "a" }
    ]
  },
  {
    id: "q2-rail-duel",
    title: "Quake II · Rail-only duel ladder",
    blurb: "Compact 4-player invitational (mock).",
    statusLine: "Scheduled · starting soon (demo)",
    final: {
      a: { handle: "vert_stacker", seed: 1 },
      b: { handle: "edge_rail", seed: 2 },
      winner: "b"
    },
    semis: [
      { a: { handle: "vert_stacker", seed: 1 }, b: { handle: "tokyo_ping", seed: 4 }, winner: "a" },
      { a: { handle: "edge_rail", seed: 2 }, b: { handle: "railbed", seed: 3 }, winner: "a" }
    ]
  }
];

type ServerRow = { name: string; address: string; players: string; map?: string; notes?: string; ranked?: boolean };

type GameBlock = { id: string; title: string; era: string; rows: ServerRow[] };

const CLASSIC_SERVERS: GameBlock[] = [
  {
    id: "hl",
    title: "Half-Life",
    era: "GoldSrc — WON / Steam",
    rows: [
      {
        name: "HLDM pick-up (demo)",
        address: "hl-demo.ifixedx.example:27015",
        players: "0/32",
        map: "crossfire",
        ranked: false,
        notes: "Placeholder — replace with live master query."
      }
    ]
  },
  {
    id: "quake1",
    title: "Quake",
    era: "id Tech — NetQuake / QuakeWorld",
    rows: [
      {
        name: "DM4 insomnia (demo)",
        address: "quake-demo.ifixedx.example:27500",
        players: "4/16",
        map: "dm4",
        ranked: true,
        notes: "Demo row for layout."
      }
    ]
  },
  {
    id: "quake2",
    title: "Quake II",
    era: "id Tech 2",
    rows: [
      {
        name: "Rail frenzy FFA",
        address: "q2-demo.ifixedx.example:27910",
        players: "2/20",
        map: "ztn2dm3",
        ranked: false
      }
    ]
  },
  {
    id: "quake3",
    title: "Quake III Arena",
    era: "id Tech 3",
    rows: [
      {
        name: "OSP Tourney (mock)",
        address: "q3-demo.ifixedx.example:27960",
        players: "6/16",
        map: "pro-q3tourney4",
        ranked: true
      }
    ]
  },
  {
    id: "cs",
    title: "Counter-Strike",
    era: "GoldSrc / 1.6",
    rows: [
      {
        name: "Dust2 24/7 (demo)",
        address: "cs-demo.ifixedx.example:27016",
        players: "12/20",
        map: "de_dust2",
        ranked: true
      }
    ]
  },
  {
    id: "cnc",
    title: "Command & Conquer (LAN classics)",
    era: "Westwood — Renegade / community tunnels",
    rows: [
      {
        name: "Renegade fan server (mock)",
        address: "cncr.ifixedx.example:4848",
        players: "—",
        ranked: false,
        notes: "Many C&C titles are peer / tunnel; document your bridge here."
      }
    ]
  }
];

type TopPlayerRow = {
  rank: number;
  handle: string;
  /** Matches {@link CLASSIC_SERVERS} `id` for leaderboard filter */
  gameId: string;
  primaryGame: string;
  skillRank: string;
  record: string;
  rating: number;
};

type GameLobbyRow = {
  id: string;
  game: string;
  room: string;
  host: string;
  players: string;
  pingMs: number;
  /** password / voice hints */
  note?: string;
};

const MOCK_XCHAT_LOBBIES: GameLobbyRow[] = [
  {
    id: "lob-q3-1",
    game: "Quake III Arena",
    room: "OSP duel — warm-up",
    host: "fragLimit",
    players: "2 / 8",
    pingMs: 28,
    note: "VOIP: XChat"
  },
  {
    id: "lob-cs-1",
    game: "Counter-Strike 1.6",
    room: "Mix night · de_inferno",
    host: "dust2_doc",
    players: "9 / 10",
    pingMs: 44
  },
  {
    id: "lob-q2-1",
    game: "Quake II",
    room: "Rail FFA — password: edge",
    host: "railw0lf",
    players: "6 / 12",
    pingMs: 51
  },
  {
    id: "lob-qw-1",
    game: "QuakeWorld",
    room: "4v4 DM pickup",
    host: "pingFairy",
    players: "7 / 8",
    pingMs: 35
  },
  {
    id: "lob-hl-1",
    game: "Half-Life",
    room: "crossfire chill",
    host: "lambda_runner",
    players: "3 / 16",
    pingMs: 62,
    note: "Unranked"
  }
];

const TOP_PLAYERS_MOCK: TopPlayerRow[] = [
  { rank: 1, handle: "fragLimit", gameId: "quake3", primaryGame: "Quake III Arena", skillRank: "Legend", record: "42-6", rating: 2310 },
  { rank: 2, handle: "zeroKelvin", gameId: "quake3", primaryGame: "Quake III Arena", skillRank: "Captain", record: "29-11", rating: 2040 },
  { rank: 3, handle: "osp_purist", gameId: "quake3", primaryGame: "Quake III Arena", skillRank: "Major", record: "24-9", rating: 1960 },
  { rank: 4, handle: "railw0lf", gameId: "quake2", primaryGame: "Quake II", skillRank: "Colonel", record: "38-9", rating: 2198 },
  { rank: 5, handle: "vert_stacker", gameId: "quake2", primaryGame: "Quake II", skillRank: "Private", record: "14-12", rating: 1760 },
  { rank: 6, handle: "edge_rail", gameId: "quake2", primaryGame: "Quake II", skillRank: "Sergeant", record: "21-14", rating: 1888 },
  { rank: 7, handle: "dust2_doc", gameId: "cs", primaryGame: "Counter-Strike 1.6", skillRank: "Major", record: "51-14", rating: 2122 },
  { rank: 8, handle: "inferno_pickup", gameId: "cs", primaryGame: "Counter-Strike 1.6", skillRank: "Corporal", record: "27-20", rating: 1844 },
  { rank: 9, handle: "train_ok", gameId: "cs", primaryGame: "Counter-Strike 1.6", skillRank: "Lieutenant", record: "30-18", rating: 1920 },
  { rank: 10, handle: "pingFairy", gameId: "quake1", primaryGame: "QuakeWorld", skillRank: "Lieutenant", record: "33-15", rating: 1988 },
  { rank: 11, handle: "dm4_insomniac", gameId: "quake1", primaryGame: "Quake / QuakeWorld", skillRank: "Staff Sergeant", record: "18-10", rating: 1810 },
  { rank: 12, handle: "lambda_runner", gameId: "hl", primaryGame: "Half-Life", skillRank: "Captain", record: "40-22", rating: 1755 },
  { rank: 13, handle: "crossfire_doc", gameId: "hl", primaryGame: "Half-Life", skillRank: "Private", record: "12-16", rating: 1580 },
  { rank: 14, handle: "nod_fan_99", gameId: "cnc", primaryGame: "C&C community", skillRank: "Corporal", record: "9-6", rating: 1622 },
  { rank: 15, handle: "ren_bot_buster", gameId: "cnc", primaryGame: "Renegade (demo)", skillRank: "Recruit", record: "4-4", rating: 1410 }
];

/** Shown in the right rail; filters Top players when one is selected (URL `xggame`). */
export const XGAMING_ALL_GAMES_ID = "all";

export const XGAMING_SUPPORTED_GAMES: { id: string; label: string }[] = CLASSIC_SERVERS.map((g) => ({
  id: g.id,
  label: g.title
}));

export function readXGamingGameIdFromUrl(): string {
  const v = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("xggame") : null;
  if (!v || v === XGAMING_ALL_GAMES_ID) return XGAMING_ALL_GAMES_ID;
  return CLASSIC_SERVERS.some((g) => g.id === v) ? v : XGAMING_ALL_GAMES_ID;
}

/** Dispatched after {@link patchXGamingGameInUrl} because `replaceState` does not fire `popstate`. */
export const XGAMING_GAME_CHANGE_EVENT = "ix-xgaming-game-changed";

export function patchXGamingGameInUrl(gameId: string): void {
  if (typeof window === "undefined") return;
  if (gameId !== XGAMING_ALL_GAMES_ID && !CLASSIC_SERVERS.some((g) => g.id === gameId)) return;
  const u = new URL(window.location.href);
  if (gameId === XGAMING_ALL_GAMES_ID) u.searchParams.delete("xggame");
  else u.searchParams.set("xggame", gameId);
  window.history.replaceState({}, "", u.toString());
  window.dispatchEvent(new CustomEvent(XGAMING_GAME_CHANGE_EVENT));
}

function TopPlayerCell({ handle }: { handle: string }) {
  const pfp = handle.replace(/^@/, "").trim().slice(0, 2).toUpperCase() || "?";
  return (
    <div className="ix-xg-player-cell">
      <span className="ix-xg-player-pfp" aria-hidden>
        {pfp}
      </span>
      <strong className="ix-xg-player-handle">@{handle.replace(/^@/, "")}</strong>
    </div>
  );
}

function SkillTierStrip() {
  return (
    <div className="ix-xg-rank-strip" role="list" aria-label="Skill tier progression (MPlayer / Heat.net style)">
      {SKILL_RANKS.map((r) => (
        <div
          key={r.id}
          className="ix-xg-rank-strip-item"
          role="listitem"
          title={`${r.name} — ${r.xpRange}`}
        >
          <img src={rankAsset(r.file)} alt="" className="ix-xg-rank-strip-img" loading="lazy" decoding="async" />
          <span className="ix-xg-rank-strip-label">{r.name}</span>
        </div>
      ))}
    </div>
  );
}

function XChatLobbyList() {
  return (
    <ul className="ix-xg-lobby-list">
      {MOCK_XCHAT_LOBBIES.map((lobby) => (
        <li key={lobby.id} className="ix-xg-lobby-card">
          <span className="ix-xg-lobby-game">{lobby.game}</span>
          <span className="ix-xg-lobby-room">{lobby.room}</span>
          <span className="ix-xg-lobby-meta">
            Host <strong>@{lobby.host}</strong> · {lobby.players} · ~{lobby.pingMs} ms
          </span>
          {lobby.note ? <span className="ix-xg-lobby-note ix-muted ix-fineprint">{lobby.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function XChatLobbiesSection() {
  return (
    <section className="ix-xg-section" aria-labelledby="ix-xg-xchat">
      <h2 id="ix-xg-xchat" className="ix-xg-h2">
        XChat game lobbies
      </h2>
      <p className="ix-muted ix-fineprint ix-xg-lead">
        Active rooms (demo). <strong>Classic X layout:</strong> this tab keeps Ranked / Unranked full width.{" "}
        <strong>Stream layout:</strong> the same list sits in the column beside Ladder / Ranked. Connect your session / party
        API for live join links.
      </p>
      <XChatLobbyList />
    </section>
  );
}

/** Stream layout: lobbies panel beside ladder/servers inside the main column (not the global right rail). */
function XGamingStreamLobbiesAside() {
  return (
    <aside className="ix-xg-stream-lobbies" aria-label="XChat game lobbies">
      <h3 className="ix-xg-stream-lobbies-title">XChat · game lobbies</h3>
      <p className="ix-muted ix-fineprint ix-xg-stream-lobbies-intro">
        Active rooms (demo). Stream layout keeps this beside the bracket / server directory. Classic X layout uses the XChat
        sub-tab instead.
      </p>
      <XChatLobbyList />
    </aside>
  );
}

function LadderBracketView({ tourney }: { tourney: LadderTournament }) {
  const win = tourney.final.winner === "a" ? tourney.final.a : tourney.final.b;
  return (
    <div className="ix-xg-bracket">
      <p className="ix-muted ix-fineprint ix-xg-lead" style={{ marginTop: 0 }}>
        {tourney.blurb}{" "}
        <span className="ix-xg-status-pill">{tourney.statusLine}</span>
      </p>
      <div className="ix-xg-round ix-xg-round--final">
        <span className="ix-xg-round-label">Final</span>
        <div className="ix-xg-match ix-xg-match--final">
          <div className="ix-xg-match-line">
            <span className={`ix-xg-pill${tourney.final.winner === "a" ? "" : " ix-xg-pill--out"}`}>
              {tourney.final.a.handle}
            </span>
            <span className="ix-xg-vs">vs</span>
            <span className={`ix-xg-pill${tourney.final.winner === "b" ? "" : " ix-xg-pill--out"}`}>
              {tourney.final.b.handle}
            </span>
          </div>
          <p className="ix-xg-crown">
            Champion: <strong>{win.handle}</strong>
          </p>
        </div>
      </div>

      <div className="ix-xg-round">
        <span className="ix-xg-round-label">Semifinals</span>
        <div className="ix-xg-round-matches">
          {tourney.semis.map((m, i) => {
            const w = m.winner === "a" ? m.a : m.b;
            const l = m.winner === "a" ? m.b : m.a;
            return (
              <div key={`${tourney.id}-semi-${m.a.seed}-${m.b.seed}`} className="ix-xg-match">
                <div className="ix-xg-match-head">Match {i + 1}</div>
                <div className="ix-xg-match-line">
                  <span className={`ix-xg-pill${w === m.a ? "" : " ix-xg-pill--out"}`}>{m.a.handle}</span>
                  <span className="ix-xg-vs">vs</span>
                  <span className={`ix-xg-pill${w === m.b ? "" : " ix-xg-pill--out"}`}>{m.b.handle}</span>
                </div>
                <p className="ix-xg-match-sub ix-muted">
                  <strong>{w.handle}</strong> advances · out: <span className="ix-xg-pill--ghost">{l.handle}</span>
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function XGamingPage({ layoutMode = "classic" }: { layoutMode?: "classic" | "stream" }) {
  const xChatAsTab = layoutMode === "classic";
  const [tab, setTabState] = useState<XGamingTab>(() => {
    const raw = readXGamingTabFromUrl();
    if (layoutMode === "stream" && raw === "xchat") return "servers";
    return raw;
  });
  const [activeLadderId, setActiveLadderId] = useState(() => LADDER_TOURNAMENTS[0]?.id ?? "q3-osp-winter");
  const [gameFilter, setGameFilter] = useState(readXGamingGameIdFromUrl);

  useEffect(() => {
    const syncGame = () => setGameFilter(readXGamingGameIdFromUrl());
    syncGame();
    window.addEventListener("popstate", syncGame);
    window.addEventListener(XGAMING_GAME_CHANGE_EVENT, syncGame as EventListener);
    return () => {
      window.removeEventListener("popstate", syncGame);
      window.removeEventListener(XGAMING_GAME_CHANGE_EVENT, syncGame as EventListener);
    };
  }, []);

  const topPlayersLeaderboard = useMemo(() => {
    const list =
      gameFilter === XGAMING_ALL_GAMES_ID
        ? [...TOP_PLAYERS_MOCK]
        : TOP_PLAYERS_MOCK.filter((r) => r.gameId === gameFilter);
    list.sort((a, b) => b.rating - a.rating);
    return list.map((r, i) => ({ ...r, boardRank: i + 1 }));
  }, [gameFilter]);

  const gameFilterLabel =
    gameFilter === XGAMING_ALL_GAMES_ID
      ? "All games"
      : XGAMING_SUPPORTED_GAMES.find((g) => g.id === gameFilter)?.label ?? "Selected game";

  const setTab = useCallback(
    (next: XGamingTab) => {
      const effective = !xChatAsTab && next === "xchat" ? "servers" : next;
      setTabState(effective);
      const u = new URL(window.location.href);
      u.searchParams.set("xgtab", effective);
      window.history.replaceState({}, "", u.toString());
    },
    [xChatAsTab]
  );

  useEffect(() => {
    if (xChatAsTab) return;
    setTabState((t) => {
      if (t !== "xchat") return t;
      const u = new URL(window.location.href);
      u.searchParams.set("xgtab", "servers");
      window.history.replaceState({}, "", u.toString());
      return "servers";
    });
  }, [xChatAsTab]);

  useEffect(() => {
    const onPop = () => {
      let t = readXGamingTabFromUrl();
      if (!xChatAsTab && t === "xchat") {
        t = "servers";
        const u = new URL(window.location.href);
        u.searchParams.set("xgtab", "servers");
        window.history.replaceState({}, "", u.toString());
      }
      setTabState(t);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [xChatAsTab]);

  const activeTourney = useMemo(
    () => LADDER_TOURNAMENTS.find((t) => t.id === activeLadderId) ?? LADDER_TOURNAMENTS[0],
    [activeLadderId]
  );

  const mainTabBody =
    tab === "ladder" ? (
      <section className="ix-xg-section" aria-labelledby="ix-xg-ladders">
        <h2 id="ix-xg-ladders" className="ix-xg-h2">
          Active tournaments
        </h2>
        <p className="ix-muted ix-fineprint ix-xg-lead">
          Pick a live ladder (demo data). Each game can run its own elimination tree; hook selections to your bracket
          backend when ready.
        </p>

        <div className="ix-xg-tourney-bar">
          <label className="ix-xg-tourney-field" htmlFor="ix-xg-tourney-select">
            <span className="ix-xg-tourney-label">Tournament</span>
            <select
              id="ix-xg-tourney-select"
              className="ix-latest-select ix-xg-select"
              value={activeLadderId}
              onChange={(e) => setActiveLadderId(e.target.value)}
            >
              {LADDER_TOURNAMENTS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h3 className="ix-xg-h3">{activeTourney.title}</h3>
        <LadderBracketView tourney={activeTourney} />
      </section>
    ) : tab === "servers" ? (
      <div className="ix-xg-servers-shell">
        <div className="ix-xg-rank-strip-block">
          <SkillTierStrip />
          <p className="ix-xg-rank-strip-note ix-muted ix-fineprint">
            Hover a badge for XP band. Art: <code>public/xgaming/ranks/</code>
          </p>
        </div>

        <section className="ix-xg-section" aria-labelledby="ix-xg-leaderboard">
          <h2 id="ix-xg-leaderboard" className="ix-xg-h2">
            Top players
          </h2>
          <p className="ix-muted ix-fineprint ix-xg-lead">
            Heat.net-style leaderboard stub (W–L, skill tier, rating).{" "}
            <strong className="ix-xg-leader-filter">{gameFilterLabel}</strong>
            {gameFilter === XGAMING_ALL_GAMES_ID ? "" : " — change via Supported games in the sidebar."} Replace with your MMR /
            ELO source.
          </p>
          <div className="ix-xg-table-wrap">
            <table className="ix-xg-table ix-xg-table--players">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Game</th>
                  <th>Rank</th>
                  <th>W–L</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {topPlayersLeaderboard.map((row) => (
                  <tr key={`${row.gameId}-${row.handle}`}>
                    <td>{row.boardRank}</td>
                    <td>
                      <TopPlayerCell handle={row.handle} />
                    </td>
                    <td>{row.primaryGame}</td>
                    <td>{row.skillRank}</td>
                    <td>{row.record}</td>
                    <td>{row.rating.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ix-xg-section" aria-labelledby="ix-xg-servers">
          <h2 id="ix-xg-servers" className="ix-xg-h2">
            Servers — ranked &amp; unranked
          </h2>
          <p className="ix-muted ix-fineprint ix-xg-lead">
            Directory stub: <strong>Ranked</strong> rows are candidates for matchmaking / ladder integrity;{" "}
            <strong>Unranked</strong> is casual pickup. Replace demo hosts with your query layer.
          </p>

          <div className="ix-xg-server-blocks">
            {CLASSIC_SERVERS.map((g) => (
              <article key={g.id} className="ix-xg-server-card">
                <header className="ix-xg-server-card-head">
                  <h3 className="ix-xg-server-title">{g.title}</h3>
                  <span className="ix-xg-server-era">{g.era}</span>
                </header>
                <div className="ix-xg-table-wrap">
                  <table className="ix-xg-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Address</th>
                        <th>Players</th>
                        <th>Map</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => (
                        <tr key={r.name + r.address}>
                          <td>{r.name}</td>
                          <td>
                            <span
                              className={
                                r.ranked ? "ix-xg-badge ix-xg-badge--ranked" : "ix-xg-badge ix-xg-badge--fun"
                              }
                            >
                              {r.ranked ? "Ranked" : "Unranked"}
                            </span>
                          </td>
                          <td>
                            <code className="ix-xg-mono">{r.address}</code>
                          </td>
                          <td>{r.players}</td>
                          <td>{r.map ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {g.rows.some((r) => r.notes) ? (
                  <ul className="ix-xg-notes ix-muted ix-fineprint">
                    {g.rows
                      .filter((r) => r.notes)
                      .map((r) => (
                        <li key={r.name}>{r.notes}</li>
                      ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>
    ) : null;

  return (
    <div className="ix-xg">
      <nav className="ix-tabs ix-xg-tabs" role="tablist" aria-label="XGaming">
        <button
          type="button"
          role="tab"
          className={`ix-tab ${tab === "ladder" ? "ix-tab--on" : ""}`}
          aria-selected={tab === "ladder"}
          onClick={() => setTab("ladder")}
        >
          Ladder Tournament
        </button>
        <button
          type="button"
          role="tab"
          className={`ix-tab ${tab === "servers" ? "ix-tab--on" : ""}`}
          aria-selected={tab === "servers"}
          onClick={() => setTab("servers")}
        >
          Ranked / Unranked
        </button>
        {xChatAsTab ? (
          <button
            type="button"
            role="tab"
            className={`ix-tab ${tab === "xchat" ? "ix-tab--on" : ""}`}
            aria-selected={tab === "xchat"}
            onClick={() => setTab("xchat")}
          >
            XChat
          </button>
        ) : null}
      </nav>

      {xChatAsTab ? (
        <>
          {mainTabBody}
          {tab === "xchat" ? <XChatLobbiesSection /> : null}
        </>
      ) : (
        <div className="ix-xg-stream-split">
          <div className="ix-xg-stream-main">{mainTabBody}</div>
          <XGamingStreamLobbiesAside />
        </div>
      )}
    </div>
  );
}
