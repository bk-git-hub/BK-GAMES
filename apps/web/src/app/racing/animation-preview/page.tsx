"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  RACING_CLIENT_EVENTS,
  RACING_NAMESPACE,
  RACING_SERVER_EVENTS,
  type RacingJoinTablePayload,
  type RacingRaceEntrySnapshot,
  type RacingRaceTickSnapshot,
  type RacingSocketErrorPayload,
  type RacingTableEventPayload,
  type RacingTableSummary,
  type RacingTableState,
  type RacingTablesResponse,
} from "@bk-games/shared/src/socket-events";
import { io, type Socket } from "socket.io-client";

import styles from "./page.module.css";

type AssetHorse = {
  color: string;
  duration: string;
  file: string;
  leader?: boolean;
  offset: string;
};

type DisplayHorse = AssetHorse & {
  lane: number;
  laneTop: string;
  name: string;
  number: number;
  progress: number;
  raceEntryId: string;
  rank: number | null;
  startLaneTop: string;
  startX: string;
};

type DisplayRacePosition = RacingRaceTickSnapshot["positions"][number] & {
  finishedAtMs?: number | null;
};

type DisplayRaceTickSnapshot = Omit<RacingRaceTickSnapshot, "positions"> & {
  positions: DisplayRacePosition[];
};

type RaceResultEntry = {
  color: AssetHorse["color"];
  finishedAtMs: number | null;
  name: string;
  number: number;
  raceEntryId: string;
  rank: number | null;
};

type RaceResultBoard = {
  entries: RaceResultEntry[];
  isComplete: boolean;
  raceId: string;
  raceNo: number;
  source: "local" | "server";
};

type VisualRaceStart = {
  raceId: string;
  startMs: number;
};

type StartCountdownOverlay = {
  isStartCue: boolean;
  label: string;
  value: string;
};

type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
  | "polling";

type RacingSimulationState = {
  raceEntryId: string;
  number: number;
  distanceM: number;
  finishedAtMs: number | null;
};

type RacingTableViewState = RacingTableState | RacingTableSummary;

type RacingTimeline = {
  maxElapsedMs: number;
  snapshots: DisplayRacePosition[][];
  tickIntervalMs: number;
};

const tableId = "main";
const previewGuestUserId = "preview:racing-animation";
const previewGuestNickname = "Racing Preview";
const restPollMs = 1_000;
const localTickMs = 160;
const minimumRaceRunDurationMs = 1_000;
const minimumTickIntervalMs = 10;
const maxUnforcedRaceDurationMultiplier = 2.2;
const smoothStartDelayThresholdMs = 2_000;
const startCountdownWindowMs = 5_000;
const startCountdownHoldMs = 1_400;
const visualRaceSpeedMultiplier = 1.7;
const worldScale = 7.2;
const trackStartPercent = 1.2;
const trackFinishPercent = 91.5;
const runnerFinishNoseOffsetPx = 185;
const maxRaceTimelineCacheEntries = 8;
const maxCameraTranslatePercent = ((worldScale - 1) / worldScale) * 100;
const leaderViewportAnchorPercent = 50 / worldScale;
const laneTops = ["14%", "23%", "32%", "41%", "50%", "57%", "64%", "71%"];
const startLaneTops = [
  "31%",
  "39.5%",
  "48%",
  "56.5%",
  "65%",
  "73.5%",
  "82%",
  "90.5%",
];

const assetHorses: AssetHorse[] = [
  {
    color: "red",
    duration: "4.2s",
    file: "/racing/generated-reference-style/horse-01-red-gallop-7f.png",
    leader: true,
    offset: "-2.7s",
  },
  {
    color: "orange",
    duration: "4.35s",
    file: "/racing/generated-reference-style/horse-02-orange-gallop-7f.png",
    offset: "-2.2s",
  },
  {
    color: "blue",
    duration: "4.5s",
    file: "/racing/generated-reference-style/horse-03-blue-gallop-7f.png",
    offset: "-1.75s",
  },
  {
    color: "yellow",
    duration: "4.65s",
    file: "/racing/generated-reference-style/horse-04-yellow-gallop-7f.png",
    offset: "-1.25s",
  },
  {
    color: "purple",
    duration: "4.85s",
    file: "/racing/generated-reference-style/horse-05-purple-gallop-7f.png",
    offset: "-0.75s",
  },
  {
    color: "green",
    duration: "5.05s",
    file: "/racing/generated-reference-style/horse-06-green-gallop-7f.png",
    offset: "-0.3s",
  },
];

const raceTimelineCache = new Map<string, RacingTimeline>();

const fallbackHorses: DisplayHorse[] = assetHorses.map((horse, index) => ({
  ...horse,
  lane: index + 1,
  laneTop: laneTops[index] ?? laneTops[laneTops.length - 1],
  name: `${horse.color} runner`,
  number: index + 1,
  progress: 0,
  raceEntryId: `preview-${index + 1}`,
  rank: index + 1,
  startLaneTop: startLaneTops[index] ?? startLaneTops[startLaneTops.length - 1],
  startX: "10.5%",
}));

export default function RacingAnimationPreviewPage() {
  const racing = useRacingTable();
  const usesBackendState = Boolean(racing.tableState?.race);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [persistedResultBoard, setPersistedResultBoard] =
    useState<RaceResultBoard | null>(null);
  const [visualRaceStart, setVisualRaceStart] =
    useState<VisualRaceStart | null>(null);
  const [trackWidthPx, setTrackWidthPx] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const tableStateRef = useRef<RacingTableViewState | null>(null);
  const visualRaceStartRef = useRef<VisualRaceStart | null>(null);
  const isVisuallyRunning = isRaceVisuallyRunning(
    racing.tableState,
    clockMs,
  );
  const isRaceRunning = !usesBackendState || isVisuallyRunning;
  const localTick = useMemo(
    () =>
      buildLocalRaceTick(
        racing.tableState,
        clockMs,
        visualRaceStart,
        isVisuallyRunning,
      ),
    [clockMs, isVisuallyRunning, racing.tableState, visualRaceStart],
  );
  const displayTick = useMemo<DisplayRaceTickSnapshot | null>(
    () => localTick ?? racing.latestTick,
    [localTick, racing.latestTick],
  );
  const currentResultBoard = useMemo(
    () => buildRaceResultBoard(racing.tableState, localTick ?? displayTick),
    [displayTick, localTick, racing.tableState],
  );
  const visibleResultBoard = chooseVisibleResultBoard(
    currentResultBoard,
    persistedResultBoard,
  );
  const displayHorses = useMemo(
    () => buildDisplayHorses(racing.tableState, displayTick),
    [displayTick, racing.tableState],
  );
  const leaderHorse = getLeaderHorse(displayHorses);
  const cameraTranslatePercent = getCameraTranslatePercent(
    leaderHorse?.progress ?? 0,
  );
  const rankedHorses = useMemo(
    () =>
      [...displayHorses].sort(
        (left, right) =>
          (left.rank ?? Number.MAX_SAFE_INTEGER) -
            (right.rank ?? Number.MAX_SAFE_INTEGER) ||
          left.number - right.number,
      ),
    [displayHorses],
  );
  const statusLabel = getStatusLabel(
    racing.connectionStatus,
    racing.tableState,
    isVisuallyRunning,
  );
  const statusDetail = getStatusDetail(
    racing.tableState,
    displayTick,
    clockMs,
    visualRaceStart,
    isVisuallyRunning,
  );
  const socketErrorMessage =
    racing.socketError?.message === "Server polling active."
      ? null
      : racing.socketError?.message;
  const cameraClassName = `${styles.cameraTrack} ${
    usesBackendState ? styles.liveCameraTrack : styles.previewCameraTrack
  }`;
  const runnerLayerClassName = `${styles.runnerLayer} ${
    usesBackendState ? styles.liveRunnerLayer : styles.previewRunnerLayer
  }`;
  const startCountdownOverlay = getStartCountdownOverlay(
    racing.tableState,
    clockMs,
  );

  useEffect(() => {
    tableStateRef.current = racing.tableState;
  }, [racing.tableState]);

  useEffect(() => {
    const trackNode = trackRef.current;

    if (!trackNode) {
      return;
    }

    const updateTrackWidth = () => {
      setTrackWidthPx(Math.round(trackNode.getBoundingClientRect().width));
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateTrackWidth);

    updateTrackWidth();
    resizeObserver?.observe(trackNode);
    window.addEventListener("resize", updateTrackWidth);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateTrackWidth);
    };
  }, []);

  useEffect(() => {
    const tableState = racing.tableState;
    const race = tableState?.race;
    const currentStart = visualRaceStartRef.current;

    if (!tableState || !race || !isVisuallyRunning) {
      if (!race || currentStart?.raceId !== race.raceId) {
        visualRaceStartRef.current = null;
        setVisualRaceStart(null);
      }

      return;
    }

    if (currentStart?.raceId === race.raceId) {
      return;
    }

    const startMs = resolveVisualRaceStartMs(tableState, Date.now());
    const nextStart = {
      raceId: race.raceId,
      startMs,
    };

    visualRaceStartRef.current = nextStart;
    setVisualRaceStart(nextStart);
  }, [isVisuallyRunning, racing.tableState]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nowMs = Date.now();

      setClockMs(nowMs);
      setPersistedResultBoard((current) => {
        const tableState = tableStateRef.current;
        const raceId = tableState?.race?.raceId ?? null;
        const isLocalRaceRunning = isRaceVisuallyRunning(tableState, nowMs);
        const localResultBoard = buildRaceResultBoard(
          tableState,
          buildLocalRaceTick(
            tableState,
            nowMs,
            visualRaceStartRef.current,
            isLocalRaceRunning,
          ),
        );

        if (isLocalRaceRunning && current?.raceId !== raceId) {
          return null;
        }

        return choosePersistedResultBoard(current, localResultBoard);
      });
    }, localTickMs);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="preview-title">
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>BK</span>
            <div>
              <h1 id="preview-title">Racing Animation</h1>
              <p>{usesBackendState ? "Backend linked" : "Asset path preview"}</p>
            </div>
          </div>
        </header>

        <div className={styles.raceFrame}>
          <div
            className={styles.track}
            aria-label="Live racing game"
            ref={trackRef}
          >
            <div
              className={cameraClassName}
              aria-hidden="true"
              style={
                {
                  "--camera-duration": leaderHorse?.duration ?? "4.2s",
                  "--camera-offset": leaderHorse?.offset ?? "-2.7s",
                  "--camera-x": `-${cameraTranslatePercent}%`,
                } as CSSProperties
              }
            >
              <div className={styles.cameraStartGate} />
              <div className={styles.cameraDistanceBoards} />
              <div className={styles.cameraFinishPost} />
            </div>
            <div className={styles.straightLaneOverlay} aria-hidden="true" />

            <div className={styles.gameHud} aria-label="Live race state">
              <div className={styles.gameStatus}>
                <span>{statusLabel}</span>
                <strong>{statusDetail}</strong>
                <small>
                  {isVisuallyRunning
                    ? "Track"
                    : getTimerLabel(racing.tableState)}
                </small>
                <em>
                  {isVisuallyRunning ? "LIVE" : getTimerText(racing.tableState)}
                </em>
              </div>
              <ol className={styles.gameRanks} aria-label="Live rank">
                {rankedHorses.map((horse) => (
                  <li key={horse.raceEntryId}>
                    <span className={`${styles.badge} ${styles[horse.color]}`}>
                      {horse.number}
                    </span>
                    <span>{formatRank(horse.rank)}</span>
                  </li>
                ))}
              </ol>
              {socketErrorMessage ? (
                <p className={styles.socketError}>{socketErrorMessage}</p>
              ) : null}
            </div>

            {startCountdownOverlay ? (
              <div
                aria-label={`${startCountdownOverlay.label} ${startCountdownOverlay.value}`}
                aria-live="polite"
                className={`${styles.startCountdown} ${
                  startCountdownOverlay.isStartCue
                    ? styles.startCountdownGo
                    : ""
                }`}
                key={startCountdownOverlay.value}
              >
                <span>{startCountdownOverlay.label}</span>
                <strong>{startCountdownOverlay.value}</strong>
              </div>
            ) : null}

            <div
              className={runnerLayerClassName}
              style={
                {
                  "--camera-duration": leaderHorse?.duration ?? "4.2s",
                  "--camera-offset": leaderHorse?.offset ?? "-2.7s",
                  "--camera-x": `-${cameraTranslatePercent}%`,
                } as CSSProperties
              }
            >
              {displayHorses.map((horse) => (
                <Runner
                  horse={horse}
                  isLeader={leaderHorse?.raceEntryId === horse.raceEntryId}
                  isRaceRunning={isRaceRunning}
                  key={horse.raceEntryId}
                  trackWidthPx={trackWidthPx}
                  usesBackendState={usesBackendState}
                />
              ))}
            </div>

            {visibleResultBoard ? (
              <aside className={styles.resultBoard} aria-label="Race result">
                <div className={styles.resultHeader}>
                  <span>Race {visibleResultBoard.raceNo}</span>
                  <strong>
                    {visibleResultBoard.isComplete ? "Result" : "Finishing"}
                  </strong>
                </div>
                <ol>
                  {visibleResultBoard.entries.map((entry) => (
                    <li key={entry.raceEntryId}>
                      <span className={`${styles.badge} ${styles[entry.color]}`}>
                        {entry.number}
                      </span>
                      <strong>{formatKoreanRank(entry.rank)}</strong>
                      <time>{formatFinishTime(entry.finishedAtMs)}</time>
                    </li>
                  ))}
                </ol>
              </aside>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

const Runner = memo(function Runner({
  horse,
  isLeader,
  isRaceRunning,
  trackWidthPx,
  usesBackendState,
}: {
  horse: DisplayHorse;
  isLeader: boolean;
  isRaceRunning: boolean;
  trackWidthPx: number;
  usesBackendState: boolean;
}) {
  const runnerPosition = getRunnerPositionStyle(
    horse.progress,
    trackWidthPx,
  );

  return (
    <div
      className={`${styles.runner} ${
        !usesBackendState ? styles.previewRunner : styles.liveRunner
      } ${isLeader ? styles.leaderRunner : ""}`}
      style={
        {
          "--duration": horse.duration,
          "--lane-top": horse.laneTop,
          "--offset": horse.offset,
          "--runner-left": runnerPosition.left,
          "--runner-x": runnerPosition.x,
          zIndex: 30 + horse.lane,
        } as CSSProperties
      }
    >
      <div
        aria-label={`${horse.number}번 말 ${
          isRaceRunning ? "달리기" : "출발 대기"
        } 애니메이션`}
        className={`${styles.sprite} ${
          isRaceRunning ? styles.runningSprite : styles.pausedSprite
        }`}
        style={
          {
            "--sprite": `url("${horse.file}")`,
          } as CSSProperties
        }
      />
    </div>
  );
});

function useRacingTable() {
  const socketRef = useRef<Socket | null>(null);
  const latestTableStateRef = useRef<RacingTableViewState | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [latestTick, setLatestTick] = useState<RacingRaceTickSnapshot | null>(
    null,
  );
  const [socketError, setSocketError] =
    useState<RacingSocketErrorPayload | null>(null);
  const [tableState, setTableState] = useState<RacingTableViewState | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const pollController = new AbortController();
    let pollTimer: number | null = null;

    function applyTableState(nextState: RacingTableViewState) {
      const resolvedState = reconcileRacingTableState(
        latestTableStateRef.current,
        nextState,
        Date.now(),
      );

      latestTableStateRef.current = resolvedState;
      setTableState(resolvedState);
      setLatestTick((currentTick) =>
        currentTick?.raceId === resolvedState.race?.raceId
          ? currentTick
          : null,
      );
    }

    async function pollTableState() {
      try {
        const state = await requestRacingTableState(pollController.signal);

        if (cancelled) {
          return;
        }

        applyTableState(state);
        setConnectionStatus((currentStatus) =>
          currentStatus === "connected" ? currentStatus : "polling",
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setConnectionStatus((currentStatus) =>
          currentStatus === "connected" ? currentStatus : "error",
        );
        setSocketError({
          code: "UNKNOWN_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Racing table polling failed.",
        });
      }
    }

    function connectSocket() {
      setConnectionStatus("connecting");
      setSocketError(null);

      const socket = io(resolveRacingSocketUrl(), {
        auth: {
          nickname: previewGuestNickname,
          role: "USER",
          userId: previewGuestUserId,
        },
        withCredentials: true,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        setConnectionStatus("connected");
        setSocketError(null);
        socket.emit(RACING_CLIENT_EVENTS.TABLE_JOIN, {
          nickname: previewGuestNickname,
          tableId,
        } satisfies RacingJoinTablePayload);
      });

      socket.on("connect_error", (error) => {
        setConnectionStatus((currentStatus) =>
          currentStatus === "polling" ? currentStatus : "error",
        );
        setSocketError({
          code: "UNKNOWN_ERROR",
          message: error.message,
        });
      });

      socket.on("disconnect", () => {
        setConnectionStatus((currentStatus) =>
          currentStatus === "polling" ? currentStatus : "disconnected",
        );
      });

      socket.on(
        RACING_SERVER_EVENTS.TABLE_STATE,
        (payload: RacingTableState) => {
          setConnectionStatus("connected");
          setSocketError(null);
          applyTableState(payload);
        },
      );

      socket.on(
        RACING_SERVER_EVENTS.TABLE_EVENT,
        (payload: RacingTableEventPayload) => {
          if (payload.type === "RACE_TICK" && payload.tick) {
            setLatestTick(payload.tick);
          }
        },
      );

      socket.on(
        RACING_SERVER_EVENTS.ERROR,
        (payload: RacingSocketErrorPayload) => {
          setSocketError({
            code: payload.code,
            message:
              payload.code === "UNAUTHORIZED"
                ? "Server polling active."
                : payload.message,
          });
        });
    }

    connectSocket();
    void pollTableState();
    pollTimer = window.setInterval(() => {
      void pollTableState();
    }, restPollMs);

    return () => {
      cancelled = true;
      pollController.abort();
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  return {
    connectionStatus,
    latestTick,
    socketError,
    tableState,
  };
}

async function requestRacingTableState(signal: AbortSignal) {
  const response = await fetch(`${resolveRacingServerUrl()}/racing/tables`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Racing table request failed (${response.status}).`);
  }

  const body = (await response.json()) as RacingTablesResponse;
  const table = body.tables.find((candidate) => candidate.tableId === tableId);

  if (!table) {
    throw new Error(`Racing table ${tableId} was not returned.`);
  }

  return table;
}

function resolveRacingSocketUrl() {
  const normalizedUrl = resolveRacingServerUrl();

  return normalizedUrl.endsWith(RACING_NAMESPACE)
    ? normalizedUrl
    : `${normalizedUrl}${RACING_NAMESPACE}`;
}

function resolveRacingServerUrl() {
  return (process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:4000")
    .replace(/\/$/, "");
}

function reconcileRacingTableState(
  currentState: RacingTableViewState | null,
  nextState: RacingTableViewState,
  nowMs: number,
) {
  if (shouldKeepCurrentRaceState(currentState, nextState, nowMs)) {
    return currentState ?? nextState;
  }

  return nextState;
}

function shouldKeepCurrentRaceState(
  currentState: RacingTableViewState | null,
  nextState: RacingTableViewState,
  nowMs: number,
) {
  const currentRace = currentState?.race;
  const nextRace = nextState.race;

  if (!currentState || !currentRace || !nextRace) {
    return false;
  }

  if (currentRace.raceId === nextRace.raceId) {
    return false;
  }

  if (nextRace.raceNo <= currentRace.raceNo) {
    return false;
  }

  if (!isRaceVisuallyRunning(currentState, nowMs)) {
    return false;
  }

  const nextStartMs = getScheduledRaceStartMs(nextState);
  const isFutureWaitingRace =
    (nextState.phase === "WAITING" || nextState.phase === "BETTING") &&
    (nextStartMs === null || nextStartMs > nowMs);

  return isFutureWaitingRace;
}

function buildDisplayHorses(
  tableState: RacingTableViewState | null,
  latestTick: DisplayRaceTickSnapshot | null,
): DisplayHorse[] {
  const race = tableState?.race;

  if (!race?.entries.length) {
    return fallbackHorses;
  }

  const positionByEntryId = new Map(
    latestTick?.raceId === race.raceId
      ? latestTick.positions.map((position) => [position.raceEntryId, position])
      : [],
  );
  const resultRankByEntryId = new Map(
    race.resultOrder.map((raceEntryId, index) => [raceEntryId, index + 1]),
  );
  return race.entries.map((entry, index) => {
    const asset = assetHorses[index % assetHorses.length];
    const position = positionByEntryId.get(entry.raceEntryId);
    const rank =
      position?.rank ??
      entry.finalRank ??
      resultRankByEntryId.get(entry.raceEntryId) ??
      null;
    const progress = position?.progress ?? (entry.finishedAtMs !== null ? 1 : 0);
    const laneIndex = Math.max(0, entry.lane - 1);

    return {
      ...asset,
      lane: entry.lane,
      laneTop: laneTops[laneIndex] ?? laneTops[laneTops.length - 1],
      name: entry.name,
      number: entry.number,
      progress: clamp(progress, 0, 1),
      raceEntryId: entry.raceEntryId,
      rank,
      startLaneTop:
        startLaneTops[laneIndex] ?? startLaneTops[startLaneTops.length - 1],
      startX: "10.5%",
    };
  });
}

function buildRaceResultBoard(
  tableState: RacingTableViewState | null,
  latestTick: DisplayRaceTickSnapshot | null,
): RaceResultBoard | null {
  const race = tableState?.race;

  if (!race?.entries.length) {
    return null;
  }

  const positionByEntryId = new Map(
    latestTick?.raceId === race.raceId
      ? latestTick.positions.map((position) => [position.raceEntryId, position])
      : [],
  );
  const hasLocalFinishTime = [...positionByEntryId.values()].some(
    (position) =>
      position.finishedAtMs !== null && position.finishedAtMs !== undefined,
  );
  const resultRankByEntryId = new Map(
    race.resultOrder.map((raceEntryId, index) => [raceEntryId, index + 1]),
  );
  const entries = race.entries
    .map((entry, index) => {
      const position = positionByEntryId.get(entry.raceEntryId);
      const asset = assetHorses[index % assetHorses.length];
      const localFinishedAtMs = position?.finishedAtMs ?? null;
      const serverFinishedAtMs = entry.finishedAtMs ?? null;
      const localRank = position?.rank ?? null;
      const serverRank =
        entry.finalRank ?? resultRankByEntryId.get(entry.raceEntryId) ?? null;

      return {
        color: asset.color,
        finishedAtMs: hasLocalFinishTime
          ? localFinishedAtMs
          : serverFinishedAtMs ?? localFinishedAtMs,
        name: entry.name,
        number: entry.number,
        raceEntryId: entry.raceEntryId,
        rank: hasLocalFinishTime
          ? localRank ?? serverRank
          : serverRank ?? localRank,
      } satisfies RaceResultEntry;
    })
    .sort(
      (left, right) =>
        (left.rank ?? Number.MAX_SAFE_INTEGER) -
          (right.rank ?? Number.MAX_SAFE_INTEGER) ||
        (left.finishedAtMs ?? Number.MAX_SAFE_INTEGER) -
          (right.finishedAtMs ?? Number.MAX_SAFE_INTEGER) ||
        left.number - right.number,
    );
  const hasAnyResult = entries.some((entry) => entry.finishedAtMs !== null);

  if (!hasAnyResult) {
    return null;
  }

  return {
    entries,
    isComplete: entries.every((entry) => entry.finishedAtMs !== null),
    raceId: race.raceId,
    raceNo: race.raceNo,
    source: hasLocalFinishTime ? "local" : "server",
  };
}

function chooseVisibleResultBoard(
  currentResultBoard: RaceResultBoard | null,
  persistedResultBoard: RaceResultBoard | null,
) {
  if (
    currentResultBoard?.source === "server" &&
    persistedResultBoard?.source === "local" &&
    persistedResultBoard.raceId === currentResultBoard.raceId
  ) {
    return persistedResultBoard;
  }

  return currentResultBoard ?? persistedResultBoard;
}

function choosePersistedResultBoard(
  current: RaceResultBoard | null,
  next: RaceResultBoard | null,
) {
  if (!next) {
    return current;
  }

  if (
    next.source === "server" &&
    current?.source === "local" &&
    current.raceId === next.raceId
  ) {
    return current;
  }

  return next;
}

function buildLocalRaceTick(
  tableState: RacingTableViewState | null,
  nowMs: number,
  visualRaceStart: VisualRaceStart | null = null,
  isVisuallyRunning = false,
): DisplayRaceTickSnapshot | null {
  const race = tableState?.race;

  if (!race || !isVisuallyRunning) {
    return null;
  }

  const raceRunDurationMs = Math.max(
    minimumRaceRunDurationMs,
    (tableState.timing.raceAndResultSeconds -
      tableState.timing.roundEndDelaySeconds) *
      1000,
  );
  const fallbackStartAt =
    Date.parse(race.startedAt ?? "") ||
    Date.parse(race.scheduledStartAt ?? "") ||
    nowMs;
  const startAt =
    visualRaceStart?.raceId === race.raceId
      ? visualRaceStart.startMs
      : fallbackStartAt;
  const visualElapsedMs = clamp(
    (nowMs - startAt) * visualRaceSpeedMultiplier,
    0,
    raceRunDurationMs * maxUnforcedRaceDurationMultiplier,
  );
  const positions = readRaceTimelineTick({
    distanceM: tableState.timing.raceDistanceM,
    elapsedMs: visualElapsedMs,
    entries: race.entries,
    runDurationMs: raceRunDurationMs,
    seed: buildSimulationSeed({
      raceId: race.raceId,
      raceNo: race.raceNo,
    }),
    tickIntervalMs: tableState.timing.tickIntervalMs,
  });

  return {
    elapsedMs: visualElapsedMs,
    positions,
    raceId: race.raceId,
  };
}

function buildSimulationSeed(input: { raceId: string; raceNo: number }) {
  return `${input.raceId}:${input.raceNo}`;
}

function readRaceTimelineTick(input: {
  distanceM: number;
  elapsedMs: number;
  entries: RacingRaceEntrySnapshot[];
  runDurationMs: number;
  seed: string;
  tickIntervalMs: number;
}) {
  const timeline = getRaceTimeline(input);
  const elapsedMs = clamp(input.elapsedMs, 0, timeline.maxElapsedMs);
  const snapshotIndex = Math.min(
    timeline.snapshots.length - 1,
    Math.floor(elapsedMs / timeline.tickIntervalMs),
  );

  return timeline.snapshots[snapshotIndex] ?? [];
}

function getRaceTimeline(input: {
  distanceM: number;
  entries: RacingRaceEntrySnapshot[];
  runDurationMs: number;
  seed: string;
  tickIntervalMs: number;
}) {
  const cacheKey = buildRaceTimelineCacheKey(input);
  const cachedTimeline = raceTimelineCache.get(cacheKey);

  if (cachedTimeline) {
    return cachedTimeline;
  }

  const timeline = buildRaceTimeline(input);

  raceTimelineCache.set(cacheKey, timeline);

  while (raceTimelineCache.size > maxRaceTimelineCacheEntries) {
    const oldestKey = raceTimelineCache.keys().next().value;

    if (!oldestKey) {
      break;
    }

    raceTimelineCache.delete(oldestKey);
  }

  return timeline;
}

function buildRaceTimeline(input: {
  distanceM: number;
  entries: RacingRaceEntrySnapshot[];
  runDurationMs: number;
  seed: string;
  tickIntervalMs: number;
}): RacingTimeline {
  const distanceM = input.distanceM;
  const runDurationMs = Math.max(minimumRaceRunDurationMs, input.runDurationMs);
  const maxElapsedMs = runDurationMs * maxUnforcedRaceDurationMultiplier;
  const tickIntervalMs = Math.max(minimumTickIntervalMs, input.tickIntervalMs);
  const states = input.entries.map((entry) => ({
    distanceM: 0,
    finishedAtMs: null,
    number: entry.number,
    raceEntryId: entry.raceEntryId,
  }));
  const snapshots: DisplayRacePosition[][] = [
    snapshotSimulationStates(states, distanceM),
  ];
  let previousStepMs = 0;

  for (let step = 1; previousStepMs < maxElapsedMs; step += 1) {
    const stepEndMs = Math.min(step * tickIntervalMs, maxElapsedMs);
    const deltaMs = stepEndMs - previousStepMs;

    advanceSimulationStep({
      deltaMs,
      distanceM,
      runDurationMs,
      seed: input.seed,
      states,
      step,
      stepEndMs,
      stepStartMs: previousStepMs,
    });

    snapshots.push(snapshotSimulationStates(states, distanceM));
    previousStepMs = stepEndMs;
  }

  return {
    maxElapsedMs,
    snapshots,
    tickIntervalMs,
  };
}

function buildRaceTimelineCacheKey(input: {
  distanceM: number;
  entries: RacingRaceEntrySnapshot[];
  runDurationMs: number;
  seed: string;
  tickIntervalMs: number;
}) {
  return JSON.stringify({
    distanceM: input.distanceM,
    entries: input.entries.map((entry) => entry.raceEntryId),
    runDurationMs: input.runDurationMs,
    seed: input.seed,
    tickIntervalMs: input.tickIntervalMs,
  });
}

function snapshotSimulationStates(
  states: RacingSimulationState[],
  distanceM: number,
) {
  return rankSimulationStates(states, distanceM).map((state, index) => ({
    finishedAtMs:
      state.finishedAtMs === null ? null : Math.round(state.finishedAtMs),
    progress: Number((state.distanceM / distanceM).toFixed(4)),
    raceEntryId: state.raceEntryId,
    rank: index + 1,
  }));
}

function advanceSimulationStep(input: {
  deltaMs: number;
  distanceM: number;
  runDurationMs: number;
  seed: string;
  states: RacingSimulationState[];
  step: number;
  stepEndMs: number;
  stepStartMs: number;
}) {
  const baseSpeedMPerMs = input.distanceM / input.runDurationMs;

  for (const state of input.states) {
    if (state.finishedAtMs !== null) {
      state.distanceM = input.distanceM;
      continue;
    }

    const previousDistanceM = state.distanceM;
    const speedMPerMs = calculateStepSpeed({
      baseSpeedMPerMs,
      distanceM: input.distanceM,
      runDurationMs: input.runDurationMs,
      seed: input.seed,
      state,
      step: input.step,
      stepEndMs: input.stepEndMs,
    });
    const nextDistanceM = Math.min(
      input.distanceM,
      previousDistanceM + speedMPerMs * input.deltaMs,
    );

    if (
      nextDistanceM >= input.distanceM &&
      previousDistanceM < input.distanceM
    ) {
      const travelledM = nextDistanceM - previousDistanceM;
      const crossingRatio =
        travelledM <= 0
          ? 1
          : (input.distanceM - previousDistanceM) / travelledM;

      state.finishedAtMs =
        input.stepStartMs + clamp(crossingRatio, 0, 1) * input.deltaMs;
    }

    state.distanceM = nextDistanceM;
  }
}

function calculateStepSpeed(input: {
  baseSpeedMPerMs: number;
  distanceM: number;
  runDurationMs: number;
  seed: string;
  state: RacingSimulationState;
  step: number;
  stepEndMs: number;
}) {
  const ratio = input.stepEndMs / input.runDurationMs;
  const entrySeed = `${input.seed}:${input.state.raceEntryId}:${input.state.number}`;
  const earlyPace = lerp(0.88, 1.14, unitRandom(`${entrySeed}:early`));
  const latePace = lerp(0.9, 1.18, unitRandom(`${entrySeed}:late`));
  const stamina = lerp(0.78, 0.94, unitRandom(`${entrySeed}:stamina`));
  const phasePace = lerp(earlyPace, latePace, smoothStep(ratio));
  const tickNoise = lerp(
    -0.18,
    0.18,
    unitRandom(`${entrySeed}:tick:${input.step}`),
  );
  const burstRoll = unitRandom(`${entrySeed}:burst:${input.step}`);
  const stumbleRoll = unitRandom(`${entrySeed}:stumble:${input.step}`);
  const burst = burstRoll > 0.91 ? lerp(0.05, 0.22, burstRoll) : 0;
  const stumble = stumbleRoll < 0.055 ? -lerp(0.05, 0.18, 1 - stumbleRoll) : 0;
  const fatigue =
    ratio <= stamina ? 1 : Math.max(0.88, 1 - (ratio - stamina) * 0.34);
  const speedMPerMs =
    input.baseSpeedMPerMs *
    Math.max(0.28, phasePace + tickNoise + burst + stumble) *
    fatigue;

  return speedMPerMs;
}

function rankSimulationStates(
  states: RacingSimulationState[],
  distanceM: number,
) {
  return [...states]
    .sort((left, right) => {
      if (left.finishedAtMs !== null || right.finishedAtMs !== null) {
        if (left.finishedAtMs === null) {
          return 1;
        }

        if (right.finishedAtMs === null) {
          return -1;
        }

        if (left.finishedAtMs !== right.finishedAtMs) {
          return left.finishedAtMs - right.finishedAtMs;
        }
      }

      if (left.distanceM !== right.distanceM) {
        return right.distanceM - left.distanceM;
      }

      if (left.number !== right.number) {
        return left.number - right.number;
      }

      return left.raceEntryId.localeCompare(right.raceEntryId);
    })
    .map((state) => ({
      ...state,
      distanceM: Math.min(distanceM, state.distanceM),
    }));
}

function deterministicScore(seed: string) {
  let hash = 2_166_136_261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function unitRandom(seed: string) {
  return deterministicScore(seed) / 0xffffffff;
}

function lerp(start: number, end: number, ratio: number) {
  return start + (end - start) * ratio;
}

function smoothStep(ratio: number) {
  const value = clamp(ratio, 0, 1);

  return value * value * (3 - 2 * value);
}

function getLeaderHorse(horses: DisplayHorse[]) {
  return [...horses].sort(
    (left, right) =>
      right.progress - left.progress ||
      (left.rank ?? Number.MAX_SAFE_INTEGER) -
        (right.rank ?? Number.MAX_SAFE_INTEGER) ||
      left.number - right.number,
  )[0];
}

function getRunnerLeftPercent(progress: number) {
  return (
    trackStartPercent +
    clamp(progress, 0, 1) * (trackFinishPercent - trackStartPercent)
  );
}

function getRunnerLeftStyle(progress: number) {
  const progressValue = clamp(progress, 0, 1);
  const leftPercent = getRunnerLeftPercent(progressValue);
  const noseOffsetPx = runnerFinishNoseOffsetPx * progressValue;

  return `calc(${leftPercent}% - ${noseOffsetPx}px)`;
}

function getRunnerPositionStyle(progress: number, trackWidthPx: number) {
  const progressValue = clamp(progress, 0, 1);

  if (trackWidthPx <= 0) {
    return {
      left: getRunnerLeftStyle(progressValue),
      x: "0px",
    };
  }

  const leftPercent = getRunnerLeftPercent(progressValue);
  const worldWidthPx = trackWidthPx * worldScale;
  const noseOffsetPx = runnerFinishNoseOffsetPx * progressValue;
  const xPx = worldWidthPx * (leftPercent / 100) - noseOffsetPx;

  return {
    left: "0px",
    x: `${xPx.toFixed(2)}px`,
  };
}

function getCameraTranslatePercent(leaderProgress: number) {
  const leaderTrackPercent = getRunnerLeftPercent(leaderProgress);

  return clamp(
    leaderTrackPercent - leaderViewportAnchorPercent,
    0,
    maxCameraTranslatePercent,
  );
}

function getStatusLabel(
  connectionStatus: ConnectionStatus,
  tableState: RacingTableViewState | null,
  isVisuallyRunning: boolean,
) {
  if (isVisuallyRunning) {
    return "RUNNING";
  }

  if (tableState?.phase) {
    return tableState.phase;
  }

  return connectionStatus.toUpperCase();
}

function getStatusDetail(
  tableState: RacingTableViewState | null,
  latestTick: RacingRaceTickSnapshot | null,
  nowMs: number,
  visualRaceStart: VisualRaceStart | null,
  isVisuallyRunning: boolean,
) {
  if (!tableState?.race) {
    return "Demo fallback";
  }

  if (isVisuallyRunning) {
    return `${formatLiveElapsedMs(
      getRaceClockElapsedMs(tableState, nowMs, visualRaceStart),
    )}s live`;
  }

  if (latestTick?.raceId === tableState.race.raceId) {
    return `${formatLiveElapsedMs(latestTick.elapsedMs)}s live`;
  }

  return `Race ${tableState.race.raceNo}`;
}

function getRaceClockElapsedMs(
  tableState: RacingTableViewState,
  nowMs: number,
  visualRaceStart: VisualRaceStart | null,
) {
  const race = tableState.race;

  if (!race) {
    return 0;
  }

  const fallbackStartAt =
    Date.parse(race.startedAt ?? "") ||
    Date.parse(race.scheduledStartAt ?? "") ||
    nowMs;
  const startAt =
    visualRaceStart?.raceId === race.raceId
      ? visualRaceStart.startMs
      : fallbackStartAt;

  return Math.max(0, nowMs - startAt);
}

function formatLiveElapsedMs(elapsedMs: number) {
  return (Math.floor(elapsedMs / 100) / 10).toFixed(1);
}

function getTimerText(tableState: RacingTableViewState | null) {
  if (!tableState?.race) {
    return "00:03";
  }

  if (tableState.phase === "RUNNING") {
    return "LIVE";
  }

  if (isRaceResultPhase(tableState.phase)) {
    return "RESULT";
  }

  const targetTime = getTimerTargetTime(tableState);

  if (!targetTime) {
    return `R${tableState.race.raceNo}`;
  }

  const remainingMs = Date.parse(targetTime) - Date.now();

  if (isRaceStartCountdownPhase(tableState) && remainingMs <= 0) {
    return "START";
  }

  if (!isRaceStartCountdownPhase(tableState) && remainingMs <= 0) {
    return `R${tableState.race.raceNo}`;
  }

  const seconds = Math.max(
    0,
    Math.ceil(remainingMs / 1000),
  );
  const minutesText = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secondsText = (seconds % 60).toString().padStart(2, "0");

  return `${minutesText}:${secondsText}`;
}

function getTimerLabel(tableState: RacingTableViewState | null) {
  if (!tableState?.race) {
    return "Ready";
  }

  if (tableState.phase === "BETTING") {
    return hasSeparateRaceStartDelay(tableState) ? "Bet closes" : "Race starts";
  }

  if (tableState.phase === "LOCKING_BETS") {
    return "Race starts";
  }

  if (tableState.phase === "RUNNING") {
    return "Track";
  }

  if (isRaceResultPhase(tableState.phase)) {
    return "Result";
  }

  return "Next race";
}

function getTimerTargetTime(tableState: RacingTableViewState) {
  if (tableState.phase === "BETTING") {
    return hasSeparateRaceStartDelay(tableState)
      ? tableState.timers.bettingClosesAt ?? tableState.timers.scheduledStartAt
      : getRaceStartTargetTime(tableState);
  }

  if (tableState.phase === "LOCKING_BETS") {
    return getRaceStartTargetTime(tableState);
  }

  return tableState.timers.scheduledStartAt ?? tableState.timers.bettingClosesAt;
}

function getStartCountdownOverlay(
  tableState: RacingTableViewState | null,
  nowMs: number,
): StartCountdownOverlay | null {
  if (!tableState?.race || !isRaceStartCountdownPhase(tableState)) {
    return null;
  }

  const targetTime = getRaceStartTargetTime(tableState);

  if (!targetTime) {
    return null;
  }

  const remainingMs = Date.parse(targetTime) - nowMs;

  if (
    remainingMs > startCountdownWindowMs ||
    remainingMs < -startCountdownHoldMs
  ) {
    return null;
  }

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  if (seconds === 0) {
    return {
      isStartCue: true,
      label: "Race start",
      value: "START",
    };
  }

  return {
    isStartCue: false,
    label: "Race starts in",
    value: seconds.toString(),
  };
}

function getRaceStartTargetTime(tableState: RacingTableViewState) {
  return (
    tableState.timers.scheduledStartAt ??
    tableState.race?.scheduledStartAt ??
    tableState.timers.bettingClosesAt
  );
}

function getScheduledRaceStartMs(tableState: RacingTableViewState) {
  const targetTime =
    tableState.timers.scheduledStartAt ?? tableState.race?.scheduledStartAt;

  if (!targetTime) {
    return null;
  }

  const startMs = Date.parse(targetTime);

  return Number.isFinite(startMs) ? startMs : null;
}

function isRaceVisuallyRunning(
  tableState: RacingTableViewState | null,
  nowMs: number,
) {
  if (!tableState?.race) {
    return false;
  }

  if (tableState.phase === "RUNNING") {
    return true;
  }

  if (tableState.phase !== "BETTING" && tableState.phase !== "LOCKING_BETS") {
    return false;
  }

  const scheduledStartMs = getScheduledRaceStartMs(tableState);

  return scheduledStartMs !== null && nowMs >= scheduledStartMs;
}

function isRaceStartCountdownPhase(tableState: RacingTableViewState) {
  return (
    tableState.phase === "LOCKING_BETS" ||
    (tableState.phase === "BETTING" && !hasSeparateRaceStartDelay(tableState))
  );
}

function isRaceResultPhase(phase: RacingTableViewState["phase"]) {
  return (
    phase === "FINISHING" ||
    phase === "SETTLING" ||
    phase === "SETTLED" ||
    phase === "ROUND_END"
  );
}

function hasSeparateRaceStartDelay(tableState: RacingTableViewState) {
  if (tableState.timing.bettingCloseBeforeStartSeconds > 0) {
    return true;
  }

  const bettingClosesAt =
    tableState.timers.bettingClosesAt ?? tableState.race?.bettingClosesAt;
  const scheduledStartAt =
    tableState.timers.scheduledStartAt ?? tableState.race?.scheduledStartAt;

  if (!bettingClosesAt || !scheduledStartAt) {
    return false;
  }

  return Date.parse(scheduledStartAt) - Date.parse(bettingClosesAt) > 1_000;
}

function resolveVisualRaceStartMs(
  tableState: RacingTableViewState,
  nowMs: number,
) {
  const race = tableState.race;

  if (!race) {
    return nowMs;
  }

  const scheduledStartMs = getScheduledRaceStartMs(tableState);

  if (scheduledStartMs !== null && nowMs >= scheduledStartMs) {
    return scheduledStartMs;
  }

  const serverStartMs =
    Date.parse(race.startedAt ?? "") ||
    scheduledStartMs ||
    nowMs;
  const serverDelayMs = Math.max(0, nowMs - serverStartMs);

  return serverDelayMs <= smoothStartDelayThresholdMs ? nowMs : serverStartMs;
}

function formatRank(rank: number | null) {
  if (rank === null) {
    return "-";
  }

  if (rank === 1) {
    return "1st";
  }

  if (rank === 2) {
    return "2nd";
  }

  if (rank === 3) {
    return "3rd";
  }

  return `${rank}th`;
}

function formatKoreanRank(rank: number | null) {
  if (rank === null) {
    return "-";
  }

  return `${rank}위`;
}

function formatFinishTime(finishedAtMs: number | null) {
  if (finishedAtMs === null) {
    return "--.--s";
  }

  return `${(finishedAtMs / visualRaceSpeedMultiplier / 1000).toFixed(2)}s`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
