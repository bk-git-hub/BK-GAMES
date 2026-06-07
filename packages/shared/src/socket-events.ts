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

export type BlackjackPlayerAction =
  | "HIT"
  | "STAND"
  | "DOUBLE"
  | "SPLIT"
  | "SURRENDER";

export type BlackjackPlaceBetPayload = {
  commandId: string;
  tableId: string;
  seatNo: number;
  amount: string;
};

export type BlackjackPlayerActionPayload = {
  tableId: string;
  seatNo: number;
  action: BlackjackPlayerAction;
  handNo?: number;
  commandId?: string;
};

export type BlackjackHandStatus =
  | "WAITING_BET"
  | "BET_PLACED"
  | "PLAYING"
  | "STOOD"
  | "DOUBLED"
  | "SURRENDERED"
  | "BUSTED"
  | "BLACKJACK";

export type BlackjackHandOutcome = "WIN" | "LOSE" | "PUSH";

export type BlackjackHandOutcomeReason =
  | "NATURAL_BLACKJACK"
  | "STANDARD"
  | "PLAYER_BUST"
  | "DEALER_BUST"
  | "SURRENDER"
  | "DEALER_BLACKJACK";

export type BlackjackHandSnapshot = {
  handNo: number;
  betAmount: string;
  handStatus: BlackjackHandStatus;
  cards: BlackjackCardSnapshot[];
  score: number | null;
  isSoft: boolean;
  isCurrentTurn: boolean;
  availableActions: BlackjackPlayerAction[];
  outcome: BlackjackHandOutcome | null;
  outcomeReason: BlackjackHandOutcomeReason | null;
  payoutAmount: string | null;
  netAmount: string | null;
};

export type BlackjackSeatSnapshot = {
  seatNo: number;
  userId: string;
  nickname: string;
  status: BlackjackSeatStatus;
  connected: boolean;
  betAmount: string | null;
  handStatus: BlackjackHandStatus;
  cards: BlackjackCardSnapshot[];
  score: number | null;
  isSoft: boolean;
  isCurrentTurn: boolean;
  availableActions: BlackjackPlayerAction[];
  activeHandNo: number | null;
  hands: BlackjackHandSnapshot[];
  outcome: BlackjackHandOutcome | null;
  outcomeReason: BlackjackHandOutcomeReason | null;
  payoutAmount: string | null;
  netAmount: string | null;
};

export type BlackjackDealerSnapshot = {
  cards: BlackjackCardSnapshot[];
  visibleScore: number | null;
  score: number | null;
};

export type BlackjackBettingLimitsSnapshot = {
  minInitialBet: string;
  maxInitialBet: string;
  maxTotalBetPerSeat: string;
  maxTotalBetPerUser: string;
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
  bettingLimits: BlackjackBettingLimitsSnapshot;
  dealer: BlackjackDealerSnapshot;
  round: BlackjackRoundSnapshot | null;
  timers: BlackjackTimerSnapshot;
  version: number;
  updatedAt: string;
};

export type BlackjackRoundSnapshot = {
  roundId: string;
  currentTurnSeatNo: number | null;
  currentTurnHandNo: number | null;
};

export type BlackjackTableEventType =
  | "TABLE_JOINED"
  | "SEAT_TAKEN"
  | "SEAT_LEFT"
  | "BET_PLACED"
  | "ROUND_STARTED"
  | "PLAYER_ACTED"
  | "DEALER_PLAYED"
  | "ROUND_SETTLED"
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
  | "UNAUTHORIZED"
  | "TABLE_NOT_FOUND"
  | "TABLE_NOT_OPEN"
  | "INVALID_TABLE_ID"
  | "INVALID_SEAT_NO"
  | "INVALID_COMMAND_ID"
  | "INVALID_BET_AMOUNT"
  | "SEAT_OCCUPIED"
  | "SEAT_NOT_OCCUPIED"
  | "SEAT_NOT_OWNED"
  | "SEAT_HAS_ACTIVE_BET"
  | "SEAT_LIMIT_REACHED"
  | "BETTING_CLOSED"
  | "BET_ALREADY_PLACED"
  | "BET_IN_PROGRESS"
  | "BET_TOO_LOW"
  | "BET_TOO_HIGH"
  | "WALLET_NOT_FOUND"
  | "WALLET_NOT_ACTIVE"
  | "INSUFFICIENT_BALANCE"
  | "IDEMPOTENCY_CONFLICT"
  | "ROUND_NOT_ACTIVE"
  | "NOT_YOUR_TURN"
  | "ACTION_NOT_ALLOWED"
  | "ROUND_NOT_FOUND"
  | "ROUND_SEAT_NOT_FOUND"
  | "INVALID_SETTLEMENT"
  | "SETTLEMENT_CONFLICT"
  | "INVALID_SOCKET_USER"
  | "UNKNOWN_ERROR";

export type BlackjackSocketErrorPayload = {
  code: BlackjackSocketErrorCode;
  message: string;
  event?: BlackjackClientEvent;
};

export type BlackjackWalletUpdatedPayload = {
  balance: string;
  delta: string;
  reason:
    | "BET_PLACED"
    | "DOUBLE_BET"
    | "SPLIT_BET"
    | "PAYOUT"
    | "PUSH_REFUND"
    | "SURRENDER_REFUND";
  ledgerId: string;
};

export function blackjackTableRoom(tableId: string) {
  return `table:${tableId}`;
}

export function blackjackUserRoom(userId: string) {
  return `user:${userId}`;
}
