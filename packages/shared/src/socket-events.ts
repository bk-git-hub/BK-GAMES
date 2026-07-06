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

export type RacingPrestartTickSnapshot = {
  scheduledStartAt: string;
  serverNowMs: number;
  remainingMs: number;
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

export type RacingBetHistoryStatus = "PLACED" | "WON" | "LOST" | "CANCELLED";

export type RacingBetHistorySelectionSnapshot = {
  raceEntryId: string;
  entryNo: number;
  displayName: string;
};

export type RacingBetHistorySnapshot = {
  betId: string;
  raceId: string;
  raceNo: number;
  tableId: string;
  betType: RacingBetType;
  amount: string;
  status: RacingBetHistoryStatus;
  payoutAmount: string;
  createdAt: string;
  settledAt: string | null;
  selections: RacingBetHistorySelectionSnapshot[];
};

export type RacingBetsResponse = {
  bets: RacingBetHistorySnapshot[];
};

export type RacingTableEventType =
  | "TABLE_JOINED"
  | "RACE_SCHEDULED"
  | "BET_PLACED"
  | "PRESTART_TICK"
  | "RACE_STARTED"
  | "RACE_TICK"
  | "RACE_SETTLED"
  | "PLAYER_DISCONNECTED";

export type RacingTableEventPayload = {
  tableId: string;
  type: RacingTableEventType;
  actorUserId: string;
  raceId?: string;
  raceNo?: number;
  betId?: string;
  betType?: RacingBetType;
  raceEntryIds?: string[];
  resultOrder?: string[];
  tick?: RacingRaceTickSnapshot;
  prestartTick?: RacingPrestartTickSnapshot;
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

export const BACCARAT_NAMESPACE = "/baccarat";

export const BACCARAT_CLIENT_EVENTS = {
  TABLE_JOIN: "table:join",
  TABLE_LEAVE: "table:leave",
  BET_PLACE: "bet:place",
  SQUEEZE_PROGRESS: "squeeze:progress",
  SQUEEZE_COMPLETE: "squeeze:complete",
} as const;

export const BACCARAT_SERVER_EVENTS = {
  TABLE_STATE: "table:state",
  TABLE_EVENT: "table:event",
  ROUND_STARTED: "round:started",
  BET_ACCEPTED: "bet:accepted",
  BET_REJECTED: "bet:rejected",
  SQUEEZE_STARTED: "squeeze:started",
  SQUEEZE_PROGRESS: "squeeze:progressed",
  SQUEEZE_COMPLETED: "squeeze:completed",
  SQUEEZE_TIMEOUT: "squeeze:timeout",
  CARD_REVEALED: "card:revealed",
  ROUND_SETTLED: "round:settled",
  WALLET_UPDATED: "wallet:updated",
  ERROR: "error",
} as const;

export type BaccaratClientEvent =
  (typeof BACCARAT_CLIENT_EVENTS)[keyof typeof BACCARAT_CLIENT_EVENTS];

export type BaccaratServerEvent =
  (typeof BACCARAT_SERVER_EVENTS)[keyof typeof BACCARAT_SERVER_EVENTS];

export type BaccaratTableStatus = "OPEN" | "MAINTENANCE" | "CLOSED";

export type BaccaratTablePhase =
  | "WAITING"
  | "WAITING_BETS"
  | "DEALING"
  | "SQUEEZE"
  | "SETTLING"
  | "SETTLED"
  | "ROUND_END"
  | "CANCELLED";

export type BaccaratRoundStatus =
  | "WAITING_BETS"
  | "DEALING"
  | "SQUEEZE"
  | "SETTLING"
  | "SETTLED"
  | "CANCELLED";

export type BaccaratBetType = "PLAYER" | "BANKER" | "TIE";
export type BaccaratBetGroup = "MAIN" | "SIDE";
export type BaccaratBetStatus = "PLACED" | "SETTLED" | "CANCELLED";
export type BaccaratRoundOutcome = "PLAYER" | "BANKER" | "TIE";
export type BaccaratBetOutcome = "WIN" | "LOSE" | "PUSH";

export type BaccaratRevealSlot =
  | "PLAYER_CARD_1"
  | "BANKER_CARD_1"
  | "PLAYER_CARD_2"
  | "BANKER_CARD_2"
  | "PLAYER_CARD_3"
  | "BANKER_CARD_3";

export type BaccaratCardRank =
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

export type BaccaratCardSuit = "clubs" | "diamonds" | "hearts" | "spades";
export type BaccaratCardValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type BaccaratVisibleCardView = {
  slot: BaccaratRevealSlot;
  rank: BaccaratCardRank;
  suit: BaccaratCardSuit;
  value: BaccaratCardValue;
  hidden?: false;
};

export type BaccaratHiddenCardView = {
  slot: BaccaratRevealSlot;
  hidden: true;
  rank?: never;
  suit?: never;
  value?: never;
};

export type BaccaratCardView =
  | BaccaratVisibleCardView
  | BaccaratHiddenCardView;

export type BaccaratSocketUser = {
  userId: string;
  nickname: string;
  role: "USER" | "ADMIN";
};

export type BaccaratTableJoinPayload = {
  tableId: string;
  nickname?: string;
};

export type BaccaratTableLeavePayload = {
  tableId: string;
};

export type BaccaratPlaceBetPayload = {
  commandId: string;
  tableId: string;
  betType: BaccaratBetType;
  amount: string;
};

export type BaccaratSqueezeProgressPayload = {
  tableId: string;
  roundId: string;
  revealId: string;
  progress: number;
};

export type BaccaratSqueezeCompletePayload = {
  tableId: string;
  roundId: string;
  revealId: string;
};

export type BaccaratRoundSnapshot = {
  roundId: string;
  shoeId: string;
  roundNo: number;
  status: BaccaratRoundStatus;
  outcome: BaccaratRoundOutcome | null;
  resultFlags: {
    isNatural: boolean;
    totalCards: number | null;
  };
};

export type BaccaratMyBetSnapshot = {
  betId: string;
  betType: BaccaratBetType;
  betGroup: "MAIN";
  amount: string;
  status: BaccaratBetStatus;
  payoutAmount: string | null;
  netAmount: string | null;
};

export type BaccaratBettingSnapshot = {
  minBet: string;
  maxMainBet: string;
  maxTotalBetPerUser: string;
  canPlaceBet: boolean;
  betTypes: BaccaratBetType[];
  totals: {
    player: string;
    banker: string;
    tie: string;
  };
  participantCount: number;
  myBet: BaccaratMyBetSnapshot | null;
};

export type BaccaratShoeSnapshot = {
  shoeId: string;
  shoeNo: number;
  deckCount: number;
  cardsDealt: number;
  cardsRemaining: number;
  penetrationPercent: number;
  willShuffleAfterRound: boolean;
};

export type BaccaratHandSnapshot = {
  cards: BaccaratCardView[];
  total: number | null;
  isNatural: boolean;
};

export type BaccaratRevealStatus =
  | "PENDING"
  | "ACTIVE"
  | "REVEALED"
  | "SKIPPED";

export type BaccaratRevealSnapshot = {
  revealId: string;
  slot: BaccaratRevealSlot;
  squeezerUserId: string | null;
  status: BaccaratRevealStatus;
  startedAt: string | null;
  endsAt: string | null;
  revealedAt: string | null;
  progress: number;
  isAutoReveal: boolean;
  card?: never;
  rank?: never;
  suit?: never;
  value?: never;
};

export type BaccaratSqueezeSnapshot = {
  revealId: string;
  slot: BaccaratRevealSlot;
  squeezerUserId: string | null;
  status: "ACTIVE" | "COMPLETED" | "TIMEOUT";
  startedAt: string | null;
  endsAt: string | null;
  progress: number;
  isAutoReveal: boolean;
  card?: never;
  rank?: never;
  suit?: never;
  value?: never;
};

export type BaccaratTimerSnapshot = {
  bettingEndsAt: string | null;
  revealEndsAt: string | null;
  roundEndsAt: string | null;
};

export type BaccaratRoundResultView = {
  roundId: string;
  roundNo: number;
  outcome: BaccaratRoundOutcome;
  playerTotal: number;
  bankerTotal: number;
  isNatural: boolean;
  totalCards: number;
};

export type BaccaratBeadPlateCell = BaccaratRoundResultView & {
  row: number;
  col: number;
};

export type BaccaratBigRoadCell = Omit<BaccaratRoundResultView, "outcome"> & {
  row: number;
  col: number;
  outcome: Exclude<BaccaratRoundOutcome, "TIE">;
  tieCount: number;
};

export type BaccaratLeadingTieMarker = BaccaratRoundResultView & {
  tieIndex: number;
};

export type BaccaratRoadmapSnapshot = {
  beadPlate: BaccaratBeadPlateCell[];
  bigRoad: BaccaratBigRoadCell[];
  leadingTies: BaccaratLeadingTieMarker[];
};

export type BaccaratTableState = {
  tableId: string;
  status: BaccaratTableStatus;
  phase: BaccaratTablePhase;
  viewerCount: number;
  round: BaccaratRoundSnapshot | null;
  betting: BaccaratBettingSnapshot;
  shoe: BaccaratShoeSnapshot | null;
  player: BaccaratHandSnapshot;
  banker: BaccaratHandSnapshot;
  reveal: BaccaratRevealSnapshot | null;
  squeeze: BaccaratSqueezeSnapshot | null;
  roadmaps: BaccaratRoadmapSnapshot;
  recentRounds: BaccaratRoundResultView[];
  timers: BaccaratTimerSnapshot;
  version: number;
  updatedAt: string;
};

export type BaccaratTableSummary = {
  tableId: string;
  gameType: "BACCARAT";
  status: BaccaratTableStatus;
  phase: BaccaratTablePhase;
  viewerCount: number;
  bettingLimits: {
    minBet: string;
    maxMainBet: string;
    maxTotalBetPerUser: string;
  };
  round: BaccaratRoundSnapshot | null;
  timers: BaccaratTimerSnapshot;
  version: number;
  updatedAt: string;
};

export type BaccaratTablesResponse = {
  tables: BaccaratTableSummary[];
};

export type BaccaratRoundStartedPayload = {
  tableId: string;
  roundId: string;
  roundNo: number;
  shoeId: string;
  stateVersion: number;
  createdAt: string;
};

export type BaccaratBetAcceptedPayload = {
  tableId: string;
  roundId: string;
  betId: string;
  commandId: string;
  betType: BaccaratBetType;
  amount: string;
  status: "PLACED";
  stateVersion: number;
  createdAt: string;
};

export type BaccaratBetRejectedPayload = {
  tableId: string;
  roundId: string | null;
  commandId: string | null;
  code: BaccaratSocketErrorCode;
  message: string;
  createdAt: string;
};

export type BaccaratSqueezeStartedPayload = {
  tableId: string;
  roundId: string;
  reveal: BaccaratRevealSnapshot;
  stateVersion: number;
  createdAt: string;
};

export type BaccaratSqueezeProgressedPayload = {
  tableId: string;
  roundId: string;
  revealId: string;
  squeezerUserId: string | null;
  progress: number;
  stateVersion: number;
  createdAt: string;
};

export type BaccaratSqueezeCompletedPayload = {
  tableId: string;
  roundId: string;
  revealId: string;
  squeezerUserId: string | null;
  stateVersion: number;
  createdAt: string;
};

export type BaccaratSqueezeTimeoutPayload = {
  tableId: string;
  roundId: string;
  revealId: string;
  stateVersion: number;
  createdAt: string;
};

export type BaccaratCardRevealedPayload = {
  tableId: string;
  roundId: string;
  revealId: string;
  slot: BaccaratRevealSlot;
  card: BaccaratVisibleCardView;
  nextReveal: BaccaratRevealSnapshot | null;
  player: BaccaratHandSnapshot;
  banker: BaccaratHandSnapshot;
  stateVersion: number;
  createdAt: string;
};

export type BaccaratRoundSettledPlayerResult = {
  playerId: string;
  nickname: string;
  betType: BaccaratBetType;
  outcome: BaccaratBetOutcome;
  betAmount: string;
  payoutAmount: string;
  netAmount: string;
};

export type BaccaratRoundSettledPayload = {
  tableId: string;
  roundId: string;
  outcome: BaccaratRoundOutcome;
  playerTotal: number;
  bankerTotal: number;
  isNatural: boolean;
  totalCards: number;
  results: BaccaratRoundSettledPlayerResult[];
  roadmaps: BaccaratRoadmapSnapshot;
  stateVersion: number;
  createdAt: string;
};

export type BaccaratTableEventType =
  | "TABLE_JOINED"
  | "TABLE_LEFT"
  | "BET_PLACED"
  | "BET_REJECTED"
  | "ROUND_STARTED"
  | "SHOE_STARTED"
  | "SQUEEZE_STARTED"
  | "SQUEEZE_PROGRESS"
  | "SQUEEZE_COMPLETED"
  | "SQUEEZE_TIMEOUT"
  | "CARD_REVEALED"
  | "ROUND_SETTLED"
  | "ROUND_RESET"
  | "ROUND_CANCELLED"
  | "PLAYER_DISCONNECTED";

export type BaccaratTableEventPayload = {
  tableId: string;
  type: BaccaratTableEventType;
  actorUserId: string | null;
  roundId?: string;
  roundNo?: number;
  shoeId?: string;
  betId?: string;
  commandId?: string;
  betType?: BaccaratBetType;
  amount?: string;
  revealId?: string;
  slot?: BaccaratRevealSlot;
  progress?: number;
  card?: BaccaratVisibleCardView;
  outcome?: BaccaratRoundOutcome;
  roadmaps?: BaccaratRoadmapSnapshot;
  stateVersion: number;
  createdAt: string;
};

export type BaccaratSocketErrorCode =
  | "UNAUTHORIZED"
  | "TABLE_NOT_FOUND"
  | "TABLE_NOT_OPEN"
  | "INVALID_TABLE_ID"
  | "INVALID_COMMAND_ID"
  | "INVALID_BET_TYPE"
  | "INVALID_BET_AMOUNT"
  | "INVALID_SOCKET_USER"
  | "BETTING_CLOSED"
  | "BET_ALREADY_PLACED"
  | "BET_TOO_LOW"
  | "BET_TOO_HIGH"
  | "WALLET_NOT_FOUND"
  | "WALLET_NOT_ACTIVE"
  | "INSUFFICIENT_BALANCE"
  | "IDEMPOTENCY_CONFLICT"
  | "ROUND_NOT_ACTIVE"
  | "ROUND_NOT_FOUND"
  | "ROUND_CANCELLED"
  | "REVEAL_NOT_ACTIVE"
  | "NOT_SQUEEZER"
  | "INVALID_REVEAL_ID"
  | "SQUEEZE_RATE_LIMITED"
  | "SQUEEZE_TIMEOUT"
  | "SHOE_NOT_READY"
  | "INVALID_SETTLEMENT"
  | "SETTLEMENT_CONFLICT"
  | "RECONNECT_STATE_UNAVAILABLE"
  | "UNKNOWN_ERROR";

export type BaccaratSocketErrorPayload = {
  code: BaccaratSocketErrorCode;
  message: string;
  event?: BaccaratClientEvent;
};

export type BaccaratWalletUpdatedPayload = {
  balance: string;
  delta: string;
  reason: "BET_PLACED" | "PAYOUT" | "PUSH_REFUND" | "CANCEL_REFUND";
  ledgerId: string;
};

export function baccaratTableRoom(tableId: string) {
  return `table:${tableId}`;
}

export function baccaratUserRoom(userId: string) {
  return `user:${userId}`;
}
