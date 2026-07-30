"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BACCARAT_CLIENT_EVENTS,
  BACCARAT_NAMESPACE,
  BACCARAT_SERVER_EVENTS,
  type BaccaratBetAcceptedPayload,
  type BaccaratBetRejectedPayload,
  type BaccaratBetType,
  type BaccaratCardRevealedPayload,
  type BaccaratMyBetSnapshot,
  type BaccaratPlaceBetPayload,
  type BaccaratRoundSettledPayload,
  type BaccaratSocketErrorPayload,
  type BaccaratSqueezeCompletedPayload,
  type BaccaratSqueezeProgressedPayload,
  type BaccaratSqueezeStartedPayload,
  type BaccaratSqueezeTimeoutPayload,
  type BaccaratTableEventPayload,
  type BaccaratTableJoinPayload,
  type BaccaratTableLeavePayload,
  type BaccaratTableState,
  type BaccaratWalletUpdatedPayload,
} from "@bk-games/shared/src/socket-events";
import type { GameTokenRole } from "@bk-games/shared/src/types";
import { io, type Socket } from "socket.io-client";

const tableId = "main";
const eventLimit = 18;
const gameSocketNamespaces = ["/blackjack", "/racing", BACCARAT_NAMESPACE];
const productionGameServerUrl =
  "https://game-server-production-78cb.up.railway.app";

export type BaccaratConnectionStatus =
  | "requesting-token"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type BaccaratTimelineTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger";

export type BaccaratTimelineEntry = {
  createdAt: string;
  detail: string;
  id: string;
  title: string;
  tone: BaccaratTimelineTone;
};

type GameTokenResponse = {
  expiresInSeconds: number;
  token: string;
  user: {
    id: string;
    nickname: string;
    role: GameTokenRole;
  };
  walletBalance: string;
};

type PrivateMyBetSnapshot = BaccaratMyBetSnapshot & {
  roundId: string;
};

type UseBaccaratTableInput = {
  initialWalletBalance: string;
};

export function useBaccaratTable({
  initialWalletBalance,
}: UseBaccaratTableInput) {
  const socketRef = useRef<Socket | null>(null);
  const latestTableStateRef = useRef<BaccaratTableState | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [connectionStatus, setConnectionStatus] =
    useState<BaccaratConnectionStatus>("requesting-token");
  const [lastBetAccepted, setLastBetAccepted] =
    useState<BaccaratBetAcceptedPayload | null>(null);
  const [lastBetRejected, setLastBetRejected] =
    useState<BaccaratBetRejectedPayload | null>(null);
  const [lastCardReveal, setLastCardReveal] =
    useState<BaccaratCardRevealedPayload | null>(null);
  const [lastRoundSettled, setLastRoundSettled] =
    useState<BaccaratRoundSettledPayload | null>(null);
  const [lastWalletUpdate, setLastWalletUpdate] =
    useState<BaccaratWalletUpdatedPayload | null>(null);
  const [player, setPlayer] = useState<GameTokenResponse["user"] | null>(null);
  const [privateMyBet, setPrivateMyBet] =
    useState<PrivateMyBetSnapshot | null>(null);
  const [socketError, setSocketError] =
    useState<BaccaratSocketErrorPayload | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [tableState, setTableState] = useState<BaccaratTableState | null>(null);
  const [timeline, setTimeline] = useState<BaccaratTimelineEntry[]>([]);
  const [walletBalance, setWalletBalance] = useState(initialWalletBalance);

  const myBet = useMemo(() => {
    const roundId = tableState?.round?.roundId ?? null;

    if (tableState?.betting.myBet) {
      return tableState.betting.myBet;
    }

    if (roundId && privateMyBet?.roundId === roundId) {
      return privateMyBet;
    }

    return null;
  }, [privateMyBet, tableState]);

  const recordTimeline = useCallback((entry: BaccaratTimelineEntry) => {
    setTimeline((currentTimeline) => [
      entry,
      ...currentTimeline.filter((item) => item.id !== entry.id),
    ].slice(0, eventLimit));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function connect() {
      setConnectionStatus("requesting-token");
      setLastBetAccepted(null);
      setLastBetRejected(null);
      setSocketError(null);
      setStatusMessage(null);

      try {
        const tokenResponse = await requestGameToken(controller.signal);

        if (cancelled) {
          return;
        }

        setPlayer(tokenResponse.user);
        setWalletBalance(tokenResponse.walletBalance);
        setConnectionStatus("connecting");

        const socket = io(resolveBaccaratSocketUrl(), {
          auth: {
            token: tokenResponse.token,
          },
          transports: ["websocket"],
          withCredentials: true,
        });

        socketRef.current = socket;

        socket.on("connect", () => {
          setConnectionStatus("connected");
          setSocketError(null);
          setStatusMessage(null);
          socket.emit(BACCARAT_CLIENT_EVENTS.TABLE_JOIN, {
            nickname: tokenResponse.user.nickname,
            tableId,
          } satisfies BaccaratTableJoinPayload);
        });

        socket.on("connect_error", (error) => {
          setConnectionStatus("error");
          setStatusMessage(error.message);
        });

        socket.on("disconnect", (reason) => {
          setConnectionStatus("disconnected");
          setStatusMessage(reason);
        });

        socket.on(
          BACCARAT_SERVER_EVENTS.TABLE_STATE,
          (payload: BaccaratTableState) => {
            const previousRoundId =
              latestTableStateRef.current?.round?.roundId ?? null;
            const nextRoundId = payload.round?.roundId ?? null;

            latestTableStateRef.current = payload;
            setConnectionStatus("connected");
            setTableState(payload);

            if (previousRoundId !== nextRoundId) {
              setLastBetAccepted(null);
              setLastBetRejected(null);
              setLastCardReveal(null);
              setLastRoundSettled(null);
            }

            if (payload.betting.myBet && payload.round) {
              setPrivateMyBet({
                ...payload.betting.myBet,
                roundId: payload.round.roundId,
              });
            }
          },
        );

        socket.on(
          BACCARAT_SERVER_EVENTS.TABLE_EVENT,
          (payload: BaccaratTableEventPayload) => {
            recordTimeline({
              createdAt: payload.createdAt,
              detail: tableEventDetail(payload),
              id: `table:${payload.type}:${payload.stateVersion}:${payload.createdAt}`,
              title: tableEventTitle(payload.type),
              tone: tableEventTone(payload.type),
            });
          },
        );

        socket.on(
          BACCARAT_SERVER_EVENTS.BET_ACCEPTED,
          (payload: BaccaratBetAcceptedPayload) => {
            setLastBetAccepted(payload);
            setLastBetRejected(null);
            setSocketError(null);
            setPrivateMyBet({
              amount: payload.amount,
              betGroup: "MAIN",
              betId: payload.betId,
              betType: payload.betType,
              netAmount: null,
              payoutAmount: null,
              roundId: payload.roundId,
              status: payload.status,
            });
            recordTimeline({
              createdAt: payload.createdAt,
              detail: `${formatBetType(payload.betType)} ${payload.amount} pts`,
              id: `accepted:${payload.betId}:${payload.commandId}`,
              title: "Bet accepted",
              tone: "success",
            });
          },
        );

        socket.on(
          BACCARAT_SERVER_EVENTS.BET_REJECTED,
          (payload: BaccaratBetRejectedPayload) => {
            setLastBetRejected(payload);
            setSocketError({
              code: payload.code,
              event: BACCARAT_CLIENT_EVENTS.BET_PLACE,
              message: payload.message,
            });
            recordTimeline({
              createdAt: payload.createdAt,
              detail: `${payload.code}: ${payload.message}`,
              id: `rejected:${payload.commandId ?? payload.createdAt}`,
              title: "Bet rejected",
              tone: "danger",
            });
          },
        );

        socket.on(
          BACCARAT_SERVER_EVENTS.SQUEEZE_STARTED,
          (payload: BaccaratSqueezeStartedPayload) => {
            recordTimeline({
              createdAt: payload.createdAt,
              detail: slotLabel(payload.reveal.slot),
              id: `reveal-started:${payload.reveal.revealId}`,
              title: "Reveal started",
              tone: "neutral",
            });
          },
        );

        socket.on(
          BACCARAT_SERVER_EVENTS.SQUEEZE_PROGRESS,
          (payload: BaccaratSqueezeProgressedPayload) => {
            recordTimeline({
              createdAt: payload.createdAt,
              detail: `${slotLabelFromRevealId(payload.revealId)} ${payload.progress}%`,
              id: `reveal-progress:${payload.revealId}:${payload.stateVersion}`,
              title: "Reveal progress",
              tone: "neutral",
            });
          },
        );

        socket.on(
          BACCARAT_SERVER_EVENTS.SQUEEZE_COMPLETED,
          (payload: BaccaratSqueezeCompletedPayload) => {
            recordTimeline({
              createdAt: payload.createdAt,
              detail: "Server completed the reveal.",
              id: `reveal-complete:${payload.revealId}:${payload.stateVersion}`,
              title: "Reveal complete",
              tone: "success",
            });
          },
        );

        socket.on(
          BACCARAT_SERVER_EVENTS.SQUEEZE_TIMEOUT,
          (payload: BaccaratSqueezeTimeoutPayload) => {
            recordTimeline({
              createdAt: payload.createdAt,
              detail: "The active reveal timed out.",
              id: `reveal-timeout:${payload.revealId}:${payload.stateVersion}`,
              title: "Reveal timeout",
              tone: "warning",
            });
          },
        );

        socket.on(
          BACCARAT_SERVER_EVENTS.CARD_REVEALED,
          (payload: BaccaratCardRevealedPayload) => {
            setLastCardReveal(payload);
            recordTimeline({
              createdAt: payload.createdAt,
              detail: slotLabel(payload.slot),
              id: `card:${payload.revealId}:${payload.stateVersion}`,
              title: "Card revealed",
              tone: "success",
            });
          },
        );

        socket.on(
          BACCARAT_SERVER_EVENTS.ROUND_SETTLED,
          (payload: BaccaratRoundSettledPayload) => {
            setLastRoundSettled(payload);
            setPrivateMyBet((currentMyBet) => {
              if (!currentMyBet || currentMyBet.roundId !== payload.roundId) {
                return currentMyBet;
              }

              const myResult = payload.results.find(
                (result) => result.playerId === tokenResponse.user.id,
              );

              if (!myResult) {
                return currentMyBet;
              }

              return {
                ...currentMyBet,
                netAmount: myResult.netAmount,
                payoutAmount: myResult.payoutAmount,
                status: "SETTLED",
              };
            });
            recordTimeline({
              createdAt: payload.createdAt,
              detail: `${formatBetType(payload.outcome)} round ${payload.roundId}`,
              id: `settled:${payload.roundId}:${payload.stateVersion}`,
              title: "Round settled",
              tone: "success",
            });
          },
        );

        socket.on(
          BACCARAT_SERVER_EVENTS.WALLET_UPDATED,
          (payload: BaccaratWalletUpdatedPayload) => {
            setWalletBalance(payload.balance);
            setLastWalletUpdate(payload);
            recordTimeline({
              createdAt: new Date().toISOString(),
              detail: `${payload.reason} ${payload.delta} pts`,
              id: `wallet:${payload.ledgerId}`,
              title: "Wallet updated",
              tone: Number(payload.delta) >= 0 ? "success" : "warning",
            });
          },
        );

        socket.on(
          BACCARAT_SERVER_EVENTS.ERROR,
          (payload: BaccaratSocketErrorPayload) => {
            setSocketError(payload);
            recordTimeline({
              createdAt: new Date().toISOString(),
              detail: `${payload.code}: ${payload.message}`,
              id: `error:${payload.event ?? "socket"}:${payload.code}:${Date.now()}`,
              title: "Socket error",
              tone: "danger",
            });
          },
        );
      } catch (error) {
        if (cancelled || controller.signal.aborted) {
          return;
        }

        setConnectionStatus("error");
        setStatusMessage(
          error instanceof Error ? error.message : "Unable to connect.",
        );
      }
    }

    void connect();

    return () => {
      cancelled = true;
      controller.abort();

      const socket = socketRef.current;

      if (socket?.connected) {
        socket.emit(BACCARAT_CLIENT_EVENTS.TABLE_LEAVE, {
          tableId,
        } satisfies BaccaratTableLeavePayload);
      }

      socket?.disconnect();
      socketRef.current = null;
    };
  }, [connectionAttempt, recordTimeline]);

  const reconnect = useCallback(() => {
    setConnectionAttempt((attempt) => attempt + 1);
  }, []);

  const joinTable = useCallback(() => {
    socketRef.current?.emit(BACCARAT_CLIENT_EVENTS.TABLE_JOIN, {
      tableId,
    } satisfies BaccaratTableJoinPayload);
  }, []);

  const placeBet = useCallback((betType: BaccaratBetType, amount: string) => {
    const socket = socketRef.current;

    if (!socket?.connected) {
      return null;
    }

    const commandId = createCommandId("baccarat-bet");

    setLastBetRejected(null);
    setSocketError(null);

    socket.emit(BACCARAT_CLIENT_EVENTS.BET_PLACE, {
      amount,
      betType,
      commandId,
      tableId,
    } satisfies BaccaratPlaceBetPayload);

    return commandId;
  }, []);

  return {
    connectionStatus,
    joinTable,
    lastBetAccepted,
    lastBetRejected,
    lastCardReveal,
    lastRoundSettled,
    lastWalletUpdate,
    myBet,
    placeBet,
    player,
    reconnect,
    socketError,
    statusMessage,
    tableId,
    tableState,
    timeline,
    walletBalance,
  };
}

async function requestGameToken(signal: AbortSignal) {
  const response = await fetch("/api/game-token", {
    method: "POST",
    signal,
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  return (await response.json()) as GameTokenResponse;
}

async function readErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `Game token request failed (${response.status}).`;
  } catch {
    return `Game token request failed (${response.status}).`;
  }
}

function resolveBaccaratSocketUrl() {
  const configuredUrl =
    normalizeConfiguredGameServerUrl(process.env.NEXT_PUBLIC_GAME_SERVER_URL) ??
    resolveRuntimeGameServerUrl();
  const normalizedUrl = stripGameSocketNamespace(configuredUrl).replace(
    /\/+$/,
    "",
  );

  return normalizedUrl.endsWith(BACCARAT_NAMESPACE)
    ? normalizedUrl
    : `${normalizedUrl}${BACCARAT_NAMESPACE}`;
}

function normalizeConfiguredGameServerUrl(value: string | undefined) {
  const normalized = value
    ?.replace(/\uFEFF/g, "")
    .trim()
    .replace(/^["']|["']$/g, "");

  return normalized || null;
}

function stripGameSocketNamespace(url: string) {
  for (const namespace of gameSocketNamespaces) {
    if (url.endsWith(namespace)) {
      return url.slice(0, -namespace.length);
    }
  }

  return url;
}

function resolveRuntimeGameServerUrl() {
  if (typeof window !== "undefined" && window.location.hostname) {
    if (!isLocalRuntimeHost(window.location.hostname)) {
      return productionGameServerUrl;
    }

    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
}

function isLocalRuntimeHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

function createCommandId(prefix: string) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function tableEventTitle(type: BaccaratTableEventPayload["type"]) {
  const labels: Record<BaccaratTableEventPayload["type"], string> = {
    BET_PLACED: "Bet placed",
    BET_REJECTED: "Bet rejected",
    CARD_REVEALED: "Card revealed",
    PLAYER_DISCONNECTED: "Player disconnected",
    ROUND_CANCELLED: "Round cancelled",
    ROUND_RESET: "Round reset",
    ROUND_SETTLED: "Round settled",
    ROUND_STARTED: "Round started",
    SHOE_STARTED: "Shoe started",
    SQUEEZE_COMPLETED: "Reveal complete",
    SQUEEZE_PROGRESS: "Reveal progress",
    SQUEEZE_STARTED: "Reveal started",
    SQUEEZE_TIMEOUT: "Reveal timeout",
    TABLE_JOINED: "Table joined",
    TABLE_LEFT: "Table left",
  };

  return labels[type];
}

function tableEventTone(
  type: BaccaratTableEventPayload["type"],
): BaccaratTimelineTone {
  if (type === "BET_REJECTED" || type === "ROUND_CANCELLED") {
    return "danger";
  }

  if (
    type === "BET_PLACED" ||
    type === "CARD_REVEALED" ||
    type === "ROUND_SETTLED"
  ) {
    return "success";
  }

  if (type === "SQUEEZE_TIMEOUT" || type === "PLAYER_DISCONNECTED") {
    return "warning";
  }

  return "neutral";
}

function tableEventDetail(payload: BaccaratTableEventPayload) {
  if (payload.betType && payload.amount) {
    return `${formatBetType(payload.betType)} ${payload.amount} pts`;
  }

  if (payload.slot) {
    return slotLabel(payload.slot);
  }

  if (payload.outcome) {
    return `${formatBetType(payload.outcome)} won`;
  }

  if (typeof payload.progress === "number") {
    return `${payload.progress}%`;
  }

  if (payload.roundNo) {
    return `Round ${payload.roundNo}`;
  }

  return `Version ${payload.stateVersion}`;
}

function formatBetType(value: BaccaratBetType | string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function slotLabel(slot: string) {
  return slot
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function slotLabelFromRevealId(revealId: string) {
  return revealId ? "Reveal" : "Reveal";
}
