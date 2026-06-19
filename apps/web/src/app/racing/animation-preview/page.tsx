"use client";

import {
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
  type RacingRaceTickSnapshot,
  type RacingSocketErrorPayload,
  type RacingTableEventPayload,
  type RacingTableState,
} from "@bk-games/shared/src/socket-events";
import type { GameTokenRole } from "@bk-games/shared/src/types";
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

type TrackPhase = {
  label: string;
  window: string;
};

type ConnectionStatus =
  | "requesting-token"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

type GameTokenResponse = {
  expiresInSeconds: number;
  token: string;
  user: {
    id: string;
    nickname: string;
    role: GameTokenRole;
  };
};

const tableId = "main";
const gameTokenTimeoutMs = 8_000;
const worldScale = 4.6;
const trackStartPercent = 1.2;
const trackFinishPercent = 88;
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
    duration: "7.4s",
    file: "/racing/generated-reference-style/horse-01-red-gallop-7f.png",
    leader: true,
    offset: "-4.8s",
  },
  {
    color: "orange",
    duration: "7.7s",
    file: "/racing/generated-reference-style/horse-02-orange-gallop-7f.png",
    offset: "-3.9s",
  },
  {
    color: "blue",
    duration: "8s",
    file: "/racing/generated-reference-style/horse-03-blue-gallop-7f.png",
    offset: "-3.1s",
  },
  {
    color: "yellow",
    duration: "8.25s",
    file: "/racing/generated-reference-style/horse-04-yellow-gallop-7f.png",
    offset: "-2.25s",
  },
  {
    color: "purple",
    duration: "8.6s",
    file: "/racing/generated-reference-style/horse-05-purple-gallop-7f.png",
    offset: "-1.35s",
  },
  {
    color: "green",
    duration: "8.95s",
    file: "/racing/generated-reference-style/horse-06-green-gallop-7f.png",
    offset: "-0.55s",
  },
];

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

const trackPhases: TrackPhase[] = [
  {
    label: "Start",
    window: "Gate to break",
  },
  {
    label: "Middle",
    window: "Open straight",
  },
  {
    label: "Finish",
    window: "Final line",
  },
];

export default function RacingAnimationPreviewPage() {
  const racing = useRacingTable();
  const usesBackendState = Boolean(racing.tableState?.race);
  const displayHorses = useMemo(
    () => buildDisplayHorses(racing.tableState, racing.latestTick),
    [racing.latestTick, racing.tableState],
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
  const statusLabel = getStatusLabel(racing.connectionStatus, racing.tableState);
  const statusDetail = getStatusDetail(racing.tableState, racing.latestTick);
  const cameraClassName = `${styles.cameraTrack} ${
    usesBackendState ? styles.liveCameraTrack : styles.previewCameraTrack
  }`;
  const runnerLayerClassName = `${styles.runnerLayer} ${
    usesBackendState ? styles.liveRunnerLayer : styles.previewRunnerLayer
  }`;

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
          <div className={styles.statusBar} aria-label="Preview status">
            <span className={styles.liveDot} />
            <span>{statusLabel}</span>
            <strong>{statusDetail}</strong>
          </div>
        </header>

        <section
          className={styles.startFrame}
          aria-label="Pre-race start state preview"
        >
          <div className={styles.startTrack}>
            <div className={styles.startGateRig} aria-hidden="true">
              {displayHorses.map((horse) => (
                <div className={styles.gateStall} key={horse.raceEntryId} />
              ))}
            </div>
            <div className={styles.startLine} aria-hidden="true" />
            <div className={styles.startHud} aria-label="Start state">
              <span>{racing.tableState?.phase ?? "GATE READY"}</span>
              <strong>{getTimerText(racing.tableState)}</strong>
            </div>
            {displayHorses.map((horse) => (
              <div
                className={styles.starter}
                key={horse.raceEntryId}
                style={
                  {
                    "--start-lane-top": horse.startLaneTop,
                    "--start-x": horse.startX,
                    zIndex: 20 + horse.lane,
                  } as CSSProperties
                }
              >
                <div
                  aria-label={`${horse.number}번 말 출발 대기 상태`}
                  className={styles.staticSprite}
                  style={
                    {
                      "--sprite": `url("${horse.file}")`,
                    } as CSSProperties
                  }
                />
                <span className={`${styles.startBadge} ${styles[horse.color]}`}>
                  {horse.number}
                </span>
              </div>
            ))}
          </div>

          <aside className={styles.startPanel} aria-label="Start lane status">
            <h2>Start Gate</h2>
            <ol>
              {displayHorses.map((horse) => (
                <li key={horse.raceEntryId}>
                  <span className={`${styles.badge} ${styles[horse.color]}`}>
                    {horse.number}
                  </span>
                  <span>Lane {horse.lane}</span>
                </li>
              ))}
            </ol>
          </aside>
        </section>

        <div className={styles.raceFrame}>
          <div className={styles.track} aria-label="Animated horse race preview">
            <div
              className={cameraClassName}
              aria-hidden="true"
              style={
                {
                  "--camera-duration": leaderHorse?.duration ?? "7.4s",
                  "--camera-offset": leaderHorse?.offset ?? "-4.8s",
                  "--camera-x": `-${cameraTranslatePercent}%`,
                } as CSSProperties
              }
            >
              <div className={styles.cameraStartGate} />
              <div className={styles.cameraDistanceBoards} />
              <div className={styles.cameraFinishPost} />
            </div>
            <div className={styles.straightLaneOverlay} aria-hidden="true" />
            <div
              className={styles.phaseHud}
              aria-label="Race background phase sequence"
            >
              {trackPhases.map((phase) => (
                <span className={styles.phasePill} key={phase.label}>
                  <strong>{phase.label}</strong>
                  <span>{phase.window}</span>
                </span>
              ))}
            </div>
            <div
              className={runnerLayerClassName}
              style={
                {
                  "--camera-duration": leaderHorse?.duration ?? "7.4s",
                  "--camera-offset": leaderHorse?.offset ?? "-4.8s",
                  "--camera-x": `-${cameraTranslatePercent}%`,
                } as CSSProperties
              }
            >
              {displayHorses.map((horse) => (
                <div
                  className={`${styles.runner} ${
                    !usesBackendState ? styles.previewRunner : styles.liveRunner
                  } ${leaderHorse?.raceEntryId === horse.raceEntryId ? styles.leaderRunner : ""}`}
                  key={horse.raceEntryId}
                  style={
                    {
                      "--duration": horse.duration,
                      "--lane-top": horse.laneTop,
                      "--offset": horse.offset,
                      "--runner-left": `${getRunnerLeftPercent(horse.progress)}%`,
                      zIndex: 30 + horse.lane,
                    } as CSSProperties
                  }
                >
                  <div
                    aria-label={`${horse.number}번 말 달리기 애니메이션`}
                    className={styles.sprite}
                    style={
                      {
                        "--sprite": `url("${horse.file}")`,
                      } as CSSProperties
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <aside className={styles.rankPanel} aria-label="Live rank preview">
            <h2>Live Rank</h2>
            <ol>
              {rankedHorses.map((horse) => (
                <li key={horse.raceEntryId}>
                  <span className={`${styles.badge} ${styles[horse.color]}`}>
                    {horse.number}
                  </span>
                  <span>{formatRank(horse.rank)}</span>
                </li>
              ))}
            </ol>
            {racing.socketError ? (
              <p className={styles.socketError}>{racing.socketError.message}</p>
            ) : null}
          </aside>
        </div>

        <section
          className={styles.spriteRows}
          aria-label="Individual spritesheet rows"
        >
          {displayHorses.map((horse) => (
            <article className={styles.spriteCard} key={horse.raceEntryId}>
              <div className={styles.cardTop}>
                <span className={`${styles.badge} ${styles[horse.color]}`}>
                  {horse.number}
                </span>
                <span>{horse.name}</span>
              </div>
              <div
                aria-label={`${horse.number}번 말 개별 spritesheet preview`}
                className={styles.rowSprite}
                style={
                  {
                    "--sprite": `url("${horse.file}")`,
                  } as CSSProperties
                }
              />
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

function useRacingTable() {
  const socketRef = useRef<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("requesting-token");
  const [latestTick, setLatestTick] = useState<RacingRaceTickSnapshot | null>(
    null,
  );
  const [socketError, setSocketError] =
    useState<RacingSocketErrorPayload | null>(null);
  const [tableState, setTableState] = useState<RacingTableState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function connect() {
      setConnectionStatus("requesting-token");
      setSocketError(null);

      try {
        const tokenResponse = await requestGameToken(controller.signal);

        if (cancelled) {
          return;
        }

        setConnectionStatus("connecting");

        const socket = io(resolveRacingSocketUrl(), {
          auth: {
            token: tokenResponse.token,
          },
          withCredentials: true,
        });

        socketRef.current = socket;

        socket.on("connect", () => {
          setConnectionStatus("connected");
          socket.emit(RACING_CLIENT_EVENTS.TABLE_JOIN, {
            tableId,
          } satisfies RacingJoinTablePayload);
        });

        socket.on("connect_error", (error) => {
          setConnectionStatus("error");
          setSocketError({
            code: "UNKNOWN_ERROR",
            message: error.message,
          });
        });

        socket.on("disconnect", () => {
          setConnectionStatus("disconnected");
        });

        socket.on(
          RACING_SERVER_EVENTS.TABLE_STATE,
          (payload: RacingTableState) => {
            setTableState(payload);
            setLatestTick((currentTick) =>
              currentTick?.raceId === payload.race?.raceId ? currentTick : null,
            );
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
            setSocketError(payload);
          },
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setConnectionStatus("error");
        setSocketError({
          code: "UNKNOWN_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Unexpected racing connection error.",
        });
      }
    }

    void connect();

    return () => {
      cancelled = true;
      controller.abort();
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

async function requestGameToken(signal: AbortSignal) {
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    timeoutController.abort();
  }, gameTokenTimeoutMs);
  const abortTimeoutRequest = () => {
    timeoutController.abort();
  };

  signal.addEventListener("abort", abortTimeoutRequest, { once: true });

  try {
    const response = await fetch("/api/game-token", {
      method: "POST",
      signal: timeoutController.signal,
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new Error(message);
    }

    return (await response.json()) as GameTokenResponse;
  } catch (error) {
    if (timeoutController.signal.aborted && !signal.aborted) {
      throw new Error("Game token request timed out.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    signal.removeEventListener("abort", abortTimeoutRequest);
  }
}

async function readErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `Game token request failed (${response.status}).`;
  } catch {
    return `Game token request failed (${response.status}).`;
  }
}

function resolveRacingSocketUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:4000";
  const normalizedUrl = configuredUrl.replace(/\/$/, "");

  return normalizedUrl.endsWith(RACING_NAMESPACE)
    ? normalizedUrl
    : `${normalizedUrl}${RACING_NAMESPACE}`;
}

function buildDisplayHorses(
  tableState: RacingTableState | null,
  latestTick: RacingRaceTickSnapshot | null,
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
  const phase = tableState?.phase;
  const isFinishedPhase =
    phase === "SETTLED" ||
    phase === "ROUND_END" ||
    phase === "FINISHING" ||
    phase === "SETTLING";

  return race.entries.map((entry, index) => {
    const asset = assetHorses[index % assetHorses.length];
    const position = positionByEntryId.get(entry.raceEntryId);
    const rank =
      position?.rank ??
      entry.finalRank ??
      resultRankByEntryId.get(entry.raceEntryId) ??
      null;
    const progress =
      position?.progress ?? (isFinishedPhase && rank !== null ? 1 : 0);
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
  tableState: RacingTableState | null,
) {
  if (tableState?.phase) {
    return tableState.phase;
  }

  if (connectionStatus === "requesting-token") {
    return "AUTH";
  }

  return connectionStatus.toUpperCase();
}

function getStatusDetail(
  tableState: RacingTableState | null,
  latestTick: RacingRaceTickSnapshot | null,
) {
  if (!tableState?.race) {
    return "Demo fallback";
  }

  if (latestTick?.raceId === tableState.race.raceId) {
    return `${Math.round(latestTick.elapsedMs / 100) / 10}s live`;
  }

  return `Race ${tableState.race.raceNo}`;
}

function getTimerText(tableState: RacingTableState | null) {
  if (!tableState?.race) {
    return "00:03";
  }

  if (tableState.phase === "RUNNING") {
    return "LIVE";
  }

  const targetTime =
    tableState.timers.bettingClosesAt ?? tableState.timers.scheduledStartAt;

  if (!targetTime) {
    return `R${tableState.race.raceNo}`;
  }

  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(targetTime) - Date.now()) / 1000),
  );
  const minutesText = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secondsText = (seconds % 60).toString().padStart(2, "0");

  return `${minutesText}:${secondsText}`;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
