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
  | "INSURANCE_DECISION"
  | "PLAYER_TURNS"
  | "DEALER_TURN"
  | "SETTLING"
  | "SETTLED"
  | "CANCELLED";

export type BlackjackSeatStatus = "OCCUPIED" | "SITTING_OUT";

export type BlackjackVisibleCardSnapshot = {
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
  hidden?: false;
};

export type BlackjackHiddenCardSnapshot = {
  hidden: true;
};

export type BlackjackCardSnapshot =
  | BlackjackVisibleCardSnapshot
  | BlackjackHiddenCardSnapshot;

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
  | "SURRENDER"
  | "INSURANCE"
  | "INSURANCE_DECLINE"
  | "EVEN_MONEY";

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

export type BlackjackTableSummary = {
  tableId: string;
  gameType: "BLACKJACK";
  status: BlackjackTableStatus;
  phase: BlackjackTablePhase;
  maxSeats: number;
  occupiedSeats: number;
  availableSeats: number;
  occupiedSeatNos: number[];
  availableSeatNos: number[];
  bettingLimits: BlackjackBettingLimitsSnapshot;
  version: number;
  updatedAt: string;
};

export type BlackjackTablesResponse = {
  tables: BlackjackTableSummary[];
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
  | "CARD_DEALT"
  | "DEALER_HOLE_CARD_DEALT"
  | "DEALER_HOLE_CARD_REVEALED"
  | "DEALER_CARD_DEALT"
  | "PLAYER_ACTED"
  | "DEALER_PLAYED"
  | "ROUND_SETTLED"
  | "ROUND_RESET"
  | "PLAYER_DISCONNECTED";

export type BlackjackCardEventTarget =
  | {
      type: "PLAYER";
      seatNo: number;
      handNo: number;
      cardIndex: number;
    }
  | {
      type: "DEALER";
      cardIndex: number;
      hidden: boolean;
    };

export type BlackjackTableEventPayload = {
  tableId: string;
  type: BlackjackTableEventType;
  actorUserId: string;
  seatNo?: number;
  card?: BlackjackCardSnapshot;
  cardTarget?: BlackjackCardEventTarget;
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
    | "INSURANCE_BET"
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

export const RACING_NAMESPACE = "/racing";

export const RACING_CLIENT_EVENTS = {
  TABLE_JOIN: "table:join",
  BET_PLACE: "bet:place",
} as const;

export const RACING_SERVER_EVENTS = {
  TABLE_STATE: "table:state",
  TABLE_EVENT: "table:event",
  WALLET_UPDATED: "wallet:updated",
  ERROR: "error",
} as const;

export type RacingClientEvent =
  (typeof RACING_CLIENT_EVENTS)[keyof typeof RACING_CLIENT_EVENTS];

export type RacingServerEvent =
  (typeof RACING_SERVER_EVENTS)[keyof typeof RACING_SERVER_EVENTS];

export type RacingTableStatus = "OPEN" | "MAINTENANCE" | "CLOSED";

export type RacingTablePhase =
  | "WAITING"
  | "BETTING"
  | "LOCKING_BETS"
  | "RUNNING"
  | "FINISHING"
  | "SETTLING"
  | "SETTLED"
  | "ROUND_END"
  | "CANCELLED";

export type RacingBetType =
  | "WIN"
  | "PLACE"
  | "QUINELLA"
  | "EXACTA"
  | "QUINELLA_PLACE"
  | "TRIO"
  | "TRIFECTA";

export type RacingSocketUser = {
  userId: string;
  nickname: string;
  role: "USER" | "ADMIN";
};

export type RacingJoinTablePayload = {
  tableId: string;
  nickname?: string;
};

export type RacingPlaceBetPayload = {
  commandId: string;
  tableId: string;
  raceId: string;
  betType: RacingBetType;
  amount: string;
  raceEntryIds: string[];
};

export type RacingBettingLimitsSnapshot = {
  minBet: string;
  maxBet: string;
};

export type RacingTimingSnapshot = {
  bettingTimeoutSeconds: number;
  raceIntervalSeconds: number;
  raceAndResultSeconds: number;
  bettingCloseBeforeStartSeconds: number;
  tickIntervalMs: number;
  raceDistanceM: number;
  roundEndDelaySeconds: number;
};

export type RacingHorseSnapshot = {
  horseId: string;
  name: string;
  silkColor: string;
  number: number;
};

export type RacingRaceEntrySnapshot = RacingHorseSnapshot & {
  raceEntryId: string;
  gateNo: number;
  lane: number;
  finalRank: number | null;
  finishedAtMs: number | null;
};

export type RacingRaceSnapshot = {
  raceId: string;
  raceNo: number;
  status: RacingTablePhase;
  phase: RacingTablePhase;
  scheduledStartAt: string | null;
  bettingOpensAt: string | null;
  bettingClosesAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  settledAt: string | null;
  resultOrder: string[];
  entries: RacingRaceEntrySnapshot[];
};

export type RacingTimerSnapshot = {
  scheduledStartAt: string | null;
  bettingClosesAt: string | null;
};

export type RacingRaceTickSnapshot = {
  raceId: string;
  elapsedMs: number;
  positions: Array<{
    raceEntryId: string;
    progress: number;
    rank: number;
  }>;
};

export type RacingTableState = {
  tableId: string;
  status: RacingTableStatus;
  phase: RacingTablePhase;
  fieldSize: number;
  viewerCount: number;
  bettingLimits: RacingBettingLimitsSnapshot;
  betTypes: RacingBetType[];
  timing: RacingTimingSnapshot;
  horses: RacingHorseSnapshot[];
  race: RacingRaceSnapshot | null;
  timers: RacingTimerSnapshot;
  version: number;
  updatedAt: string;
};

export type RacingTableSummary = {
  tableId: string;
  gameType: "RACING";
  status: RacingTableStatus;
  phase: RacingTablePhase;
  fieldSize: number;
  viewerCount: number;
  bettingLimits: RacingBettingLimitsSnapshot;
  betTypes: RacingBetType[];
  timing: RacingTimingSnapshot;
  race: RacingRaceSnapshot | null;
  timers: RacingTimerSnapshot;
  version: number;
  updatedAt: string;
};

export type RacingTablesResponse = {
  tables: RacingTableSummary[];
};

export type RacingSettledRaceEntrySnapshot = RacingRaceEntrySnapshot & {
  finalRank: number;
  finishedAtMs: number;
};

export type RacingSettledRaceSnapshot = Omit<RacingRaceSnapshot, "entries"> & {
  entries: RacingSettledRaceEntrySnapshot[];
};

export type RacingRaceResultsResponse = {
  tableId: string;
  date: string;
  limit: number;
  races: RacingSettledRaceSnapshot[];
};

export type RacingHorseRecentResultSnapshot = {
  raceId: string;
  raceNo: number;
  finalRank: number;
  finishedAtMs: number;
};

export type RacingHorseStatsSnapshot = RacingHorseSnapshot & {
  starts: number;
  wins: number;
  winRate: number;
  top2: number;
  top2Rate: number;
  top3: number;
  top3Rate: number;
  averageRank: number | null;
  averageFinishMs: number | null;
  bestRank: number | null;
  worstRank: number | null;
  recentRanks: number[];
  recentResults: RacingHorseRecentResultSnapshot[];
};

export type RacingHorseStatsResponse = {
  tableId: string;
  date: string;
  limit: number;
  raceCount: number;
  horses: RacingHorseStatsSnapshot[];
};

export type RacingTableEventType =
  | "TABLE_JOINED"
  | "RACE_SCHEDULED"
  | "BET_PLACED"
  | "RACE_STARTED"
  | "RACE_TICK"
  | "RACE_SETTLED"
  | "PLAYER_DISCONNECTED";

export type RacingTableEventPayload = {
  tableId: string;
  type: RacingTableEventType;
  actorUserId: string;
  raceId?: string;
  betId?: string;
  betType?: RacingBetType;
  raceEntryIds?: string[];
  resultOrder?: string[];
  tick?: RacingRaceTickSnapshot;
  stateVersion: number;
  createdAt: string;
};

export type RacingSocketErrorCode =
  | "UNAUTHORIZED"
  | "TABLE_NOT_FOUND"
  | "TABLE_NOT_OPEN"
  | "INVALID_TABLE_ID"
  | "INVALID_COMMAND_ID"
  | "INVALID_BET_AMOUNT"
  | "INVALID_BET"
  | "INVALID_SOCKET_USER"
  | "RACE_NOT_FOUND"
  | "RACE_ENTRY_NOT_FOUND"
  | "BETTING_CLOSED"
  | "BET_TOO_LOW"
  | "BET_TOO_HIGH"
  | "BET_ALREADY_PLACED"
  | "WALLET_NOT_FOUND"
  | "WALLET_NOT_ACTIVE"
  | "INSUFFICIENT_BALANCE"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_SETTLEMENT"
  | "SETTLEMENT_CONFLICT"
  | "UNKNOWN_ERROR";

export type RacingSocketErrorPayload = {
  code: RacingSocketErrorCode;
  message: string;
  event?: RacingClientEvent;
};

export type RacingWalletUpdatedPayload = {
  balance: string;
  delta: string;
  reason: "BET_PLACED" | "PAYOUT" | "CANCEL_REFUND";
  ledgerId: string;
};

export function racingTableRoom(tableId: string) {
  return `table:${tableId}`;
}

export function racingUserRoom(userId: string) {
  return `user:${userId}`;
}
