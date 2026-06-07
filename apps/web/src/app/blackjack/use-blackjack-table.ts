"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BLACKJACK_CLIENT_EVENTS,
  BLACKJACK_NAMESPACE,
  BLACKJACK_SERVER_EVENTS,
  type BlackjackJoinTablePayload,
  type BlackjackLeaveSeatPayload,
  type BlackjackPlaceBetPayload,
  type BlackjackPlayerAction,
  type BlackjackPlayerActionPayload,
  type BlackjackSocketErrorPayload,
  type BlackjackTableEventPayload,
  type BlackjackTableState,
  type BlackjackTakeSeatPayload,
  type BlackjackWalletUpdatedPayload,
} from "@bk-games/shared/src/socket-events";
import type { GameTokenRole } from "@bk-games/shared/src/types";
import { io, type Socket } from "socket.io-client";

const tableId = "main";
const eventLimit = 14;

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

type UseBlackjackTableInput = {
  initialWalletBalance: string;
};

export function useBlackjackTable({
  initialWalletBalance,
}: UseBlackjackTableInput) {
  const socketRef = useRef<Socket | null>(null);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("requesting-token");
  const [events, setEvents] = useState<BlackjackTableEventPayload[]>([]);
  const [lastWalletUpdate, setLastWalletUpdate] =
    useState<BlackjackWalletUpdatedPayload | null>(null);
  const [player, setPlayer] = useState<GameTokenResponse["user"] | null>(null);
  const [roundNotice, setRoundNotice] = useState<string | null>(null);
  const [socketError, setSocketError] =
    useState<BlackjackSocketErrorPayload | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [tableState, setTableState] = useState<BlackjackTableState | null>(
    null,
  );
  const [walletBalance, setWalletBalance] = useState(initialWalletBalance);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function connect() {
      setConnectionStatus("requesting-token");
      setSocketError(null);
      setStatusMessage(null);

      try {
        const tokenResponse = await requestGameToken(controller.signal);

        if (cancelled) {
          return;
        }

        setPlayer(tokenResponse.user);
        setConnectionStatus("connecting");

        const socket = io(resolveBlackjackSocketUrl(), {
          auth: {
            token: tokenResponse.token,
          },
          withCredentials: true,
        });

        socketRef.current = socket;

        socket.on("connect", () => {
          setConnectionStatus("connected");
          setStatusMessage(null);
          socket.emit(BLACKJACK_CLIENT_EVENTS.TABLE_JOIN, {
            tableId,
          } satisfies BlackjackJoinTablePayload);
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
          BLACKJACK_SERVER_EVENTS.TABLE_STATE,
          (payload: BlackjackTableState) => {
            setTableState(payload);
          },
        );

        socket.on(
          BLACKJACK_SERVER_EVENTS.TABLE_EVENT,
          (payload: BlackjackTableEventPayload) => {
            setEvents((currentEvents) =>
              [payload, ...currentEvents].slice(0, eventLimit),
            );

            if (payload.type === "ROUND_SETTLED") {
              setRoundNotice("Round settled.");
            }

            if (payload.type === "ROUND_RESET") {
              setRoundNotice("Round reset.");
            }
          },
        );

        socket.on(
          BLACKJACK_SERVER_EVENTS.WALLET_UPDATED,
          (payload: BlackjackWalletUpdatedPayload) => {
            setWalletBalance(payload.balance);
            setLastWalletUpdate(payload);
          },
        );

        socket.on(
          BLACKJACK_SERVER_EVENTS.ERROR,
          (payload: BlackjackSocketErrorPayload) => {
            setSocketError(payload);
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
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connectionAttempt]);

  const reconnect = useCallback(() => {
    setConnectionAttempt((attempt) => attempt + 1);
  }, []);

  const joinTable = useCallback(() => {
    socketRef.current?.emit(BLACKJACK_CLIENT_EVENTS.TABLE_JOIN, {
      tableId,
    } satisfies BlackjackJoinTablePayload);
  }, []);

  const takeSeat = useCallback((seatNo: number) => {
    socketRef.current?.emit(BLACKJACK_CLIENT_EVENTS.SEAT_TAKE, {
      seatNo,
      tableId,
    } satisfies BlackjackTakeSeatPayload);
  }, []);

  const leaveSeat = useCallback((seatNo: number) => {
    socketRef.current?.emit(BLACKJACK_CLIENT_EVENTS.SEAT_LEAVE, {
      seatNo,
      tableId,
    } satisfies BlackjackLeaveSeatPayload);
  }, []);

  const placeBet = useCallback((seatNo: number, amount: string) => {
    socketRef.current?.emit(BLACKJACK_CLIENT_EVENTS.BET_PLACE, {
      amount,
      commandId: createCommandId("bet"),
      seatNo,
      tableId,
    } satisfies BlackjackPlaceBetPayload);
  }, []);

  const sendPlayerAction = useCallback(
    (input: {
      action: BlackjackPlayerAction;
      handNo?: number;
      seatNo: number;
    }) => {
      const payload: BlackjackPlayerActionPayload = {
        action: input.action,
        handNo: input.handNo,
        seatNo: input.seatNo,
        tableId,
      };

      if (actionRequiresCommandId(input.action)) {
        payload.commandId = createCommandId(input.action.toLowerCase());
      }

      socketRef.current?.emit(BLACKJACK_CLIENT_EVENTS.PLAYER_ACTION, payload);
    },
    [],
  );

  return {
    connectionStatus,
    events,
    joinTable,
    lastWalletUpdate,
    leaveSeat,
    placeBet,
    player,
    reconnect,
    roundNotice,
    sendPlayerAction,
    socketError,
    statusMessage,
    tableId,
    tableState,
    takeSeat,
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

function resolveBlackjackSocketUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "http://localhost:4000";
  const normalizedUrl = configuredUrl.replace(/\/$/, "");

  return normalizedUrl.endsWith(BLACKJACK_NAMESPACE)
    ? normalizedUrl
    : `${normalizedUrl}${BLACKJACK_NAMESPACE}`;
}

function createCommandId(prefix: string) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function actionRequiresCommandId(action: BlackjackPlayerAction) {
  return (
    action === "DOUBLE" ||
    action === "SPLIT" ||
    action === "INSURANCE" ||
    action === "EVEN_MONEY"
  );
}
