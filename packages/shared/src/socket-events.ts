export const BLACKJACK_NAMESPACE = "/blackjack";

export const BLACKJACK_CLIENT_EVENTS = {
  TABLE_JOIN: "table:join",
  SEAT_TAKE: "seat:take",
  SEAT_LEAVE: "seat:leave",
  BET_PLACE: "bet:place",
  PLAYER_ACTION: "player:action",
} as const;

export const BLACKJACK_SERVER_EVENTS = {
  TABLE_STATE: "table:state",
  TABLE_EVENT: "table:event",
  WALLET_UPDATED: "wallet:updated",
  ERROR: "error",
} as const;

export type BlackjackClientEvent =
  (typeof BLACKJACK_CLIENT_EVENTS)[keyof typeof BLACKJACK_CLIENT_EVENTS];

export type BlackjackServerEvent =
  (typeof BLACKJACK_SERVER_EVENTS)[keyof typeof BLACKJACK_SERVER_EVENTS];

export type BlackjackTableStatus = "OPEN" | "MAINTENANCE" | "CLOSED";

export type BlackjackTablePhase =
  | "WAITING"
  | "WAITING_BETS"
  | "DEALING"
  | "PLAYER_TURNS"
  | "DEALER_TURN"
  | "SETTLING"
  | "SETTLED"
  | "CANCELLED";

export type BlackjackSeatStatus = "OCCUPIED" | "SITTING_OUT";

export type BlackjackCardSnapshot = {
  rank:
    | "A"
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "10"
    | "J"
    | "Q"
    | "K";
  suit: "clubs" | "diamonds" | "hearts" | "spades";
  hidden?: boolean;
};

export type BlackjackSocketUser = {
  userId: string;
  nickname: string;
  role: "USER" | "ADMIN";
};

export type BlackjackJoinTablePayload = {
  tableId: string;
  nickname?: string;
};

export type BlackjackTakeSeatPayload = {
  tableId: string;
  seatNo: number;
  nickname?: string;
};

export type BlackjackLeaveSeatPayload = {
  tableId: string;
  seatNo: number;
};

export type BlackjackSeatSnapshot = {
  seatNo: number;
  userId: string;
  nickname: string;
  status: BlackjackSeatStatus;
  connected: boolean;
  betAmount: string | null;
};

export type BlackjackDealerSnapshot = {
  cards: BlackjackCardSnapshot[];
  visibleScore: number | null;
  score: number | null;
};

export type BlackjackTimerSnapshot = {
  phaseEndsAt: string | null;
  turnEndsAt: string | null;
};

export type BlackjackTableState = {
  tableId: string;
  status: BlackjackTableStatus;
  phase: BlackjackTablePhase;
  seats: BlackjackSeatSnapshot[];
  dealer: BlackjackDealerSnapshot;
  round: null;
  timers: BlackjackTimerSnapshot;
  version: number;
  updatedAt: string;
};

export type BlackjackTableEventType =
  | "TABLE_JOINED"
  | "SEAT_TAKEN"
  | "SEAT_LEFT"
  | "PLAYER_DISCONNECTED";

export type BlackjackTableEventPayload = {
  tableId: string;
  type: BlackjackTableEventType;
  actorUserId: string;
  seatNo?: number;
  stateVersion: number;
  createdAt: string;
};

export type BlackjackSocketErrorCode =
  | "INVALID_TABLE_ID"
  | "INVALID_SEAT_NO"
  | "SEAT_OCCUPIED"
  | "SEAT_NOT_OCCUPIED"
  | "SEAT_NOT_OWNED"
  | "SEAT_LIMIT_REACHED"
  | "INVALID_SOCKET_USER"
  | "UNKNOWN_ERROR";

export type BlackjackSocketErrorPayload = {
  code: BlackjackSocketErrorCode;
  message: string;
  event?: BlackjackClientEvent;
};

export function blackjackTableRoom(tableId: string) {
  return `table:${tableId}`;
}

export function blackjackUserRoom(userId: string) {
  return `user:${userId}`;
}
