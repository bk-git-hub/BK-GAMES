import { Injectable } from '@nestjs/common';
import {
  type BaccaratBetAcceptedPayload,
  type BaccaratBetOutcome,
  type BaccaratBetStatus,
  type BaccaratBetType,
  type BaccaratCardSuit,
  type BaccaratCardValue,
  type BaccaratCardView,
  type BaccaratHandSnapshot,
  type BaccaratRevealSlot,
  type BaccaratRevealSnapshot,
  type BaccaratRevealStatus,
  type BaccaratRoundOutcome,
  type BaccaratRoundResultView,
  type BaccaratRoundSettledPayload,
  type BaccaratRoundSettledPlayerResult,
  type BaccaratRoundSnapshot,
  type BaccaratRoundStatus,
  type BaccaratShoeSnapshot,
  type BaccaratSocketErrorCode,
  type BaccaratSocketUser,
  type BaccaratSqueezeProgressedPayload,
  type BaccaratTableEventPayload,
  type BaccaratTablePhase,
  type BaccaratTableState,
  type BaccaratTableStatus,
  type BaccaratVisibleCardView,
} from '@bk-games/shared';
import {
  buildBaccaratRoadmaps,
  getBaccaratCardValue,
  type BaccaratCard,
} from './baccarat-engine.port';

export type BaccaratTableConfig = {
  status: BaccaratTableStatus;
  minBet: bigint;
  maxMainBet: bigint;
  maxTotalBetPerUser: bigint;
  bettingTimeoutSeconds: number;
  squeezeTimeoutSeconds: number;
  roundEndDelaySeconds: number;
  deckCount: number;
  shoePenetrationPercent: number;
  minimumCardsBeforeRound: number;
  resultHistoryLimit: number;
  tiePayoutNumerator: number;
  tiePayoutDenominator: number;
  bankerCommissionBps: number;
  betTypes: BaccaratBetType[];
};

export type BaccaratRuntimeRoundSnapshot = {
  roundId: string;
  shoeId: string;
  roundNo: number;
  status: BaccaratRoundStatus;
  bettingOpensAt: string | null;
  bettingClosesAt: string | null;
  playerCards: BaccaratCard[];
  bankerCards: BaccaratCard[];
  playerTotal: number | null;
  bankerTotal: number | null;
  outcome: BaccaratRoundOutcome | null;
  isNatural: boolean;
  totalCards: number | null;
};

export type BaccaratRuntimeRevealSnapshot = {
  revealId: string;
  slot: BaccaratRevealSlot;
  status: BaccaratRevealStatus;
  sequence: number;
  squeezerUserId: string | null;
  progress: number;
  startedAt: string | null;
  endsAt: string | null;
  revealedAt: string | null;
  card: BaccaratCard | null;
};

export type BaccaratRuntimeBetSnapshot = {
  betId: string;
  userId: string;
  nickname: string | null;
  betType: BaccaratBetType;
  amount: bigint;
  status: BaccaratBetStatus;
  payoutAmount: bigint | null;
  netAmount: bigint | null;
  commandId: string;
  createdAt: string;
};

export type BaccaratConfigureTableInput = {
  tableId: string;
  config: BaccaratTableConfig;
  shoe: BaccaratShoeSnapshot | null;
  round: BaccaratRuntimeRoundSnapshot | null;
  reveals: BaccaratRuntimeRevealSnapshot[];
  bets: BaccaratRuntimeBetSnapshot[];
  recentRounds: BaccaratRoundResultView[];
};

export type BaccaratJoinTableInput = {
  tableId: string;
  socketId: string;
  user: BaccaratSocketUser;
};

export type BaccaratRecordBetAcceptedInput = {
  tableId: string;
  socketId: string;
  user: BaccaratSocketUser;
  bet: BaccaratRuntimeBetSnapshot;
  commandId: string;
};

export type BaccaratDealRoundInput = {
  tableId: string;
  round: BaccaratRuntimeRoundSnapshot;
  shoe: BaccaratShoeSnapshot;
  reveals: BaccaratRuntimeRevealSnapshot[];
};

export type BaccaratSettlementInput = {
  tableId: string;
  roundId: string;
  outcome: BaccaratRoundOutcome;
  playerTotal: number;
  bankerTotal: number;
  isNatural: boolean;
  totalCards: number;
  bets: BaccaratSettlementBetInput[];
  recentRounds: BaccaratRoundResultView[];
};

export type BaccaratSettlementBetInput = {
  betId: string;
  userId: string;
  betType: BaccaratBetType;
  outcome: BaccaratBetOutcome;
  payoutAmount: bigint;
  netAmount: bigint;
};

export type BaccaratResetRoundInput = {
  tableId: string;
  round: BaccaratRuntimeRoundSnapshot;
  shoe: BaccaratShoeSnapshot | null;
  reveals: BaccaratRuntimeRevealSnapshot[];
  bets: BaccaratRuntimeBetSnapshot[];
  recentRounds: BaccaratRoundResultView[];
};

export type BaccaratTableMutationResult = {
  state: BaccaratTableState;
  event?: BaccaratTableEventPayload;
  betAccepted?: BaccaratBetAcceptedPayload;
  squeezeProgressed?: BaccaratSqueezeProgressedPayload;
  cardRevealed?: {
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
  roundSettled?: BaccaratRoundSettledPayload;
};

@Injectable()
export class BaccaratTableService {
  private readonly tables = new Map<string, BaccaratTableRuntime>();

  configureTable(
    input: BaccaratConfigureTableInput,
  ): BaccaratTableMutationResult | null {
    const tableId = normalizeTableId(input.tableId);
    const config = normalizeTableConfig(input.config);
    const existing = this.tables.get(tableId);

    if (!existing) {
      const table = this.createRuntimeTable(tableId, config, input);

      this.tables.set(tableId, table);
      return {
        state: this.toState(table),
        event: this.toEvent(table, 'ROUND_RESET', 'SYSTEM'),
      };
    }

    const previousKey = buildSyncKey(existing);

    existing.config = config;
    existing.status = config.status;
    existing.shoe = input.shoe;
    existing.recentRounds = [...input.recentRounds];
    existing.roadmaps = buildRoadmapsFromRecentRounds(input.recentRounds);

    if (existing.round?.roundId !== input.round?.roundId) {
      existing.round = input.round ? createRoundRuntime(input.round) : null;
      existing.reveals = input.reveals.map(createRevealRuntime);
      existing.bets = createBetMap(input.bets);
      existing.phase = input.round ? toTablePhase(input.round.status) : 'WAITING';
    } else if (input.round) {
      syncRoundRuntime(existing, input.round, input.reveals, input.bets);
    } else {
      existing.round = null;
      existing.reveals = [];
      existing.bets.clear();
      existing.phase = 'WAITING';
    }

    if (previousKey === buildSyncKey(existing)) {
      return null;
    }

    this.bump(existing);

    return {
      state: this.toState(existing),
      event: this.toEvent(existing, 'ROUND_RESET', 'SYSTEM'),
    };
  }

  joinTable(input: BaccaratJoinTableInput): BaccaratTableMutationResult {
    const table = this.getTable(input.tableId);
    const user = normalizeSocketUser(input.user);

    table.connections.set(input.socketId, user);
    this.bump(table);

    return {
      state: this.toState(table, user.userId),
      event: this.toEvent(table, 'TABLE_JOINED', user.userId),
    };
  }

  leaveTable(input: BaccaratJoinTableInput): BaccaratTableMutationResult {
    const table = this.getTable(input.tableId);
    const user = normalizeSocketUser(input.user);

    table.connections.delete(input.socketId);
    this.bump(table);

    return {
      state: this.toState(table, user.userId),
      event: this.toEvent(table, 'TABLE_LEFT', user.userId),
    };
  }

  requireBettingRound(input: {
    tableId: string;
    roundId?: string | null;
  }): BaccaratRoundRuntime {
    const table = this.getTable(input.tableId);

    assertTableOpen(table);

    if (!table.round) {
      throw new BaccaratTableError(
        'ROUND_NOT_FOUND',
        `Baccarat table ${table.tableId} does not have an active round.`,
      );
    }

    if (input.roundId && table.round.roundId !== input.roundId.trim()) {
      throw new BaccaratTableError(
        'ROUND_NOT_FOUND',
        `Baccarat round ${input.roundId} is not active on table ${table.tableId}.`,
      );
    }

    if (
      table.phase !== 'WAITING_BETS' ||
      table.round.status !== 'WAITING_BETS' ||
      isBettingWindowClosed(table.round)
    ) {
      throw new BaccaratTableError(
        'BETTING_CLOSED',
        `Baccarat table ${table.tableId} is not accepting bets.`,
      );
    }

    return table.round;
  }

  recordBetAccepted(
    input: BaccaratRecordBetAcceptedInput,
  ): BaccaratTableMutationResult {
    const table = this.getTable(input.tableId);
    const user = normalizeSocketUser(input.user);

    if (!table.round) {
      throw new BaccaratTableError(
        'ROUND_NOT_FOUND',
        `Baccarat table ${table.tableId} does not have an active round.`,
      );
    }

    table.connections.set(input.socketId, user);
    table.bets.set(input.bet.userId, {
      ...input.bet,
      nickname: input.bet.nickname ?? user.nickname,
    });
    this.bump(table);

    return {
      state: this.toState(table, user.userId),
      event: this.toEvent(table, 'BET_PLACED', user.userId, {
        roundId: table.round.roundId,
        roundNo: table.round.roundNo,
        betId: input.bet.betId,
        commandId: input.commandId,
        betType: input.bet.betType,
        amount: input.bet.amount.toString(),
      }),
      betAccepted: {
        tableId: table.tableId,
        roundId: table.round.roundId,
        betId: input.bet.betId,
        commandId: input.commandId,
        betType: input.bet.betType,
        amount: input.bet.amount.toString(),
        status: 'PLACED',
        stateVersion: table.version,
        createdAt: table.updatedAt,
      },
    };
  }

  startDealing(input: BaccaratDealRoundInput): BaccaratTableMutationResult {
    const table = this.getTable(input.tableId);

    table.round = createRoundRuntime(input.round);
    table.shoe = input.shoe;
    table.reveals = input.reveals.map(createRevealRuntime);
    table.phase = 'DEALING';
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'ROUND_STARTED', 'SYSTEM', {
        roundId: table.round.roundId,
        roundNo: table.round.roundNo,
        shoeId: table.round.shoeId,
      }),
    };
  }

  startNextReveal(input: {
    tableId: string;
    now?: Date;
  }): BaccaratTableMutationResult | null {
    const table = this.getTable(input.tableId);
    const round = requireRound(table);
    const existingActive = table.reveals.find(
      (reveal) => reveal.status === 'ACTIVE',
    );

    if (existingActive) {
      return null;
    }

    const reveal = table.reveals.find((candidate) => candidate.status === 'PENDING');

    if (!reveal) {
      return null;
    }

    const now = input.now ?? new Date();
    const endsAt = new Date(
      now.getTime() + table.config.squeezeTimeoutSeconds * 1000,
    );
    const squeezerUserId = chooseSqueezerUserId(table);

    reveal.status = 'ACTIVE';
    reveal.squeezerUserId = squeezerUserId;
    reveal.progress = 0;
    reveal.startedAt = now.toISOString();
    reveal.endsAt = endsAt.toISOString();
    table.phase = 'SQUEEZE';
    round.status = 'SQUEEZE';
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'SQUEEZE_STARTED', squeezerUserId, {
        roundId: round.roundId,
        roundNo: round.roundNo,
        revealId: reveal.revealId,
        slot: reveal.slot,
        progress: reveal.progress,
      }),
    };
  }

  recordSqueezeProgress(input: {
    tableId: string;
    roundId: string;
    revealId: string;
    user: BaccaratSocketUser;
    progress: number;
  }): BaccaratTableMutationResult {
    const table = this.getTable(input.tableId);
    const user = normalizeSocketUser(input.user);
    const round = requireRound(table);
    const reveal = requireActiveReveal(table, input.roundId, input.revealId);
    const progress = normalizeProgress(input.progress);

    if (reveal.squeezerUserId !== user.userId) {
      throw new BaccaratTableError(
        'NOT_SQUEEZER',
        `User ${user.userId} is not the active Baccarat squeezer.`,
      );
    }

    reveal.progress = progress;
    this.bump(table);

    return {
      state: this.toState(table, user.userId),
      event: this.toEvent(table, 'SQUEEZE_PROGRESS', user.userId, {
        roundId: round.roundId,
        roundNo: round.roundNo,
        revealId: reveal.revealId,
        slot: reveal.slot,
        progress,
      }),
      squeezeProgressed: {
        tableId: table.tableId,
        roundId: round.roundId,
        revealId: reveal.revealId,
        squeezerUserId: user.userId,
        progress,
        stateVersion: table.version,
        createdAt: table.updatedAt,
      },
    };
  }

  completeActiveReveal(input: {
    tableId: string;
    roundId: string;
    revealId: string;
    user?: BaccaratSocketUser;
    system?: boolean;
    now?: Date;
  }): BaccaratTableMutationResult {
    const table = this.getTable(input.tableId);
    const round = requireRound(table);
    const reveal = requireActiveReveal(table, input.roundId, input.revealId);
    const actorUserId = input.system
      ? 'SYSTEM'
      : normalizeSocketUser(input.user).userId;

    if (!input.system && reveal.squeezerUserId !== actorUserId) {
      throw new BaccaratTableError(
        'NOT_SQUEEZER',
        `User ${actorUserId} is not the active Baccarat squeezer.`,
      );
    }

    const card = requireRevealCard(round, reveal.slot);
    const revealedAt = input.now ?? new Date();

    reveal.status = 'REVEALED';
    reveal.progress = 100;
    reveal.revealedAt = revealedAt.toISOString();
    reveal.card = card;

    const hasPendingReveal = table.reveals.some(
      (candidate) => candidate.status === 'PENDING',
    );

    if (!hasPendingReveal) {
      table.phase = 'SETTLING';
      round.status = 'SETTLING';
    }

    this.bump(table);

    const visibleCard = toVisibleCardView(reveal.slot, card);
    const state = this.toState(table, actorUserId === 'SYSTEM' ? undefined : actorUserId);

    return {
      state,
      event: this.toEvent(table, 'CARD_REVEALED', actorUserId, {
        roundId: round.roundId,
        roundNo: round.roundNo,
        revealId: reveal.revealId,
        slot: reveal.slot,
        card: visibleCard,
      }),
      cardRevealed: {
        tableId: table.tableId,
        roundId: round.roundId,
        revealId: reveal.revealId,
        slot: reveal.slot,
        card: visibleCard,
        nextReveal: state.reveal,
        player: state.player,
        banker: state.banker,
        stateVersion: table.version,
        createdAt: table.updatedAt,
      },
    };
  }

  confirmSettlement(input: BaccaratSettlementInput): BaccaratTableMutationResult {
    const table = this.getTable(input.tableId);
    const round = requireRound(table);

    if (round.roundId !== input.roundId) {
      throw new BaccaratTableError(
        'ROUND_NOT_FOUND',
        `Baccarat round ${input.roundId} is not active on table ${table.tableId}.`,
      );
    }

    round.status = 'SETTLED';
    round.outcome = input.outcome;
    round.playerTotal = input.playerTotal;
    round.bankerTotal = input.bankerTotal;
    round.isNatural = input.isNatural;
    round.totalCards = input.totalCards;
    table.phase = 'SETTLED';

    for (const bet of input.bets) {
      const runtimeBet = table.bets.get(bet.userId);

      if (!runtimeBet) {
        continue;
      }

      runtimeBet.status = 'SETTLED';
      runtimeBet.payoutAmount = bet.payoutAmount;
      runtimeBet.netAmount = bet.netAmount;
    }

    table.recentRounds = [...input.recentRounds];
    table.roadmaps = buildRoadmapsFromRecentRounds(input.recentRounds);
    this.bump(table);

    const state = this.toState(table);
    const results = input.bets.map((bet) =>
      toSettledPlayerResult(table, bet),
    );

    return {
      state,
      event: this.toEvent(table, 'ROUND_SETTLED', 'SYSTEM', {
        roundId: round.roundId,
        roundNo: round.roundNo,
        outcome: input.outcome,
        roadmaps: table.roadmaps,
      }),
      roundSettled: {
        tableId: table.tableId,
        roundId: round.roundId,
        outcome: input.outcome,
        playerTotal: input.playerTotal,
        bankerTotal: input.bankerTotal,
        isNatural: input.isNatural,
        totalCards: input.totalCards,
        results,
        roadmaps: table.roadmaps,
        stateVersion: table.version,
        createdAt: table.updatedAt,
      },
    };
  }

  enterRoundEnd(input: {
    tableId: string;
    roundEndsAt: Date;
  }): BaccaratTableState {
    const table = this.getTable(input.tableId);

    if (table.phase !== 'SETTLED') {
      return this.toState(table);
    }

    table.phase = 'ROUND_END';
    table.roundEndsAt = input.roundEndsAt.toISOString();
    this.bump(table);

    return this.toState(table);
  }

  resetRound(input: BaccaratResetRoundInput): BaccaratTableMutationResult {
    const table = this.getTable(input.tableId);

    table.round = createRoundRuntime(input.round);
    table.shoe = input.shoe;
    table.reveals = input.reveals.map(createRevealRuntime);
    table.bets = createBetMap(input.bets);
    table.phase = toTablePhase(input.round.status);
    table.roundEndsAt = null;
    table.recentRounds = [...input.recentRounds];
    table.roadmaps = buildRoadmapsFromRecentRounds(input.recentRounds);
    this.bump(table);

    return {
      state: this.toState(table),
      event: this.toEvent(table, 'ROUND_RESET', 'SYSTEM', {
        roundId: input.round.roundId,
        roundNo: input.round.roundNo,
      }),
    };
  }

  disconnectSocket(socketId: string): BaccaratTableMutationResult[] {
    const updates: BaccaratTableMutationResult[] = [];

    for (const table of this.tables.values()) {
      const user = table.connections.get(socketId);

      if (!user) {
        continue;
      }

      table.connections.delete(socketId);
      this.bump(table);
      updates.push({
        state: this.toState(table),
        event: this.toEvent(table, 'PLAYER_DISCONNECTED', user.userId),
      });
    }

    return updates;
  }

  hasTable(tableId: string) {
    return this.tables.has(normalizeTableId(tableId));
  }

  getRoundEndDelaySeconds(tableId: string) {
    return this.getTable(tableId).config.roundEndDelaySeconds;
  }

  getTableState(tableId: string, viewerUserId?: string): BaccaratTableState {
    return this.toState(this.getTable(tableId), viewerUserId);
  }

  private createRuntimeTable(
    tableId: string,
    config: BaccaratTableConfig,
    input: BaccaratConfigureTableInput,
  ): BaccaratTableRuntime {
    const now = new Date().toISOString();
    const round = input.round ? createRoundRuntime(input.round) : null;
    const reveals = input.reveals.map(createRevealRuntime);

    if (round) {
      markRevealedCards(round, reveals);
    }

    return {
      tableId,
      status: config.status,
      phase: round ? toTablePhase(round.status) : 'WAITING',
      config,
      shoe: input.shoe,
      round,
      reveals,
      bets: createBetMap(input.bets),
      recentRounds: [...input.recentRounds],
      roadmaps: buildRoadmapsFromRecentRounds(input.recentRounds),
      roundEndsAt: null,
      connections: new Map(),
      version: 0,
      updatedAt: now,
    };
  }

  private getTable(tableId: string) {
    const normalizedTableId = normalizeTableId(tableId);
    const table = this.tables.get(normalizedTableId);

    if (!table) {
      throw new BaccaratTableError(
        'TABLE_NOT_FOUND',
        `Baccarat table ${normalizedTableId} is not configured.`,
      );
    }

    return table;
  }

  private bump(table: BaccaratTableRuntime) {
    table.version += 1;
    table.updatedAt = new Date().toISOString();
  }

  private toState(
    table: BaccaratTableRuntime,
    viewerUserId?: string,
  ): BaccaratTableState {
    const round = table.round;
    const currentReveal =
      table.reveals.find((reveal) => reveal.status === 'ACTIVE') ?? null;
    const betting = buildBettingSnapshot(table, viewerUserId);

    return {
      tableId: table.tableId,
      status: table.status,
      phase: table.phase,
      viewerCount: countUniqueViewers(table),
      round: round ? toRoundSnapshot(table, round) : null,
      betting,
      shoe: table.shoe,
      player: round ? toHandSnapshot(round, 'PLAYER', table.phase) : emptyHand(),
      banker: round ? toHandSnapshot(round, 'BANKER', table.phase) : emptyHand(),
      reveal: currentReveal ? toRevealSnapshot(currentReveal) : null,
      squeeze: currentReveal
        ? {
            ...toRevealSnapshot(currentReveal),
            status:
              currentReveal.status === 'ACTIVE'
                ? 'ACTIVE'
                : currentReveal.status === 'REVEALED'
                  ? 'COMPLETED'
                  : 'TIMEOUT',
          }
        : null,
      roadmaps: table.roadmaps,
      recentRounds: table.recentRounds,
      timers: {
        bettingEndsAt: round?.bettingClosesAt ?? null,
        revealEndsAt: currentReveal?.endsAt ?? null,
        roundEndsAt: table.roundEndsAt,
      },
      version: table.version,
      updatedAt: table.updatedAt,
    };
  }

  private toEvent(
    table: BaccaratTableRuntime,
    type: BaccaratTableEventPayload['type'],
    actorUserId: string | null,
    metadata: BaccaratTableEventMetadata = {},
  ): BaccaratTableEventPayload {
    return {
      tableId: table.tableId,
      type,
      actorUserId,
      ...metadata,
      stateVersion: table.version,
      createdAt: table.updatedAt,
    };
  }
}

export class BaccaratTableError extends Error {
  constructor(
    readonly code: BaccaratSocketErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BaccaratTableError';
  }
}

type BaccaratTableRuntime = {
  tableId: string;
  status: BaccaratTableStatus;
  phase: BaccaratTablePhase;
  config: BaccaratTableConfig;
  shoe: BaccaratShoeSnapshot | null;
  round: BaccaratRoundRuntime | null;
  reveals: BaccaratRevealRuntime[];
  bets: Map<string, BaccaratRuntimeBetSnapshot>;
  recentRounds: BaccaratRoundResultView[];
  roadmaps: BaccaratTableState['roadmaps'];
  roundEndsAt: string | null;
  connections: Map<string, BaccaratSocketUser>;
  version: number;
  updatedAt: string;
};

type BaccaratRoundRuntime = Omit<
  BaccaratRuntimeRoundSnapshot,
  'playerCards' | 'bankerCards'
> & {
  playerCards: BaccaratRuntimeCard[];
  bankerCards: BaccaratRuntimeCard[];
};

type BaccaratRuntimeCard = BaccaratCard & {
  revealed: boolean;
};

type BaccaratRevealRuntime = Omit<BaccaratRuntimeRevealSnapshot, 'card'> & {
  card: BaccaratCard | null;
};

type BaccaratTableEventMetadata = Partial<
  Pick<
    BaccaratTableEventPayload,
    | 'roundId'
    | 'roundNo'
    | 'shoeId'
    | 'betId'
    | 'commandId'
    | 'betType'
    | 'amount'
    | 'revealId'
    | 'slot'
    | 'progress'
    | 'card'
    | 'outcome'
    | 'roadmaps'
  >
>;

function createRoundRuntime(
  input: BaccaratRuntimeRoundSnapshot,
): BaccaratRoundRuntime {
  return {
    ...input,
    playerCards: input.playerCards.map((card, index) => ({
      ...card,
      revealed: false,
    })),
    bankerCards: input.bankerCards.map((card, index) => ({
      ...card,
      revealed: false,
    })),
  };
}

function createRevealRuntime(
  input: BaccaratRuntimeRevealSnapshot,
): BaccaratRevealRuntime {
  return {
    ...input,
    card: input.card ? { ...input.card } : null,
  };
}

function createBetMap(input: BaccaratRuntimeBetSnapshot[]) {
  return new Map(input.map((bet) => [bet.userId, { ...bet }]));
}

function syncRoundRuntime(
  table: BaccaratTableRuntime,
  input: BaccaratRuntimeRoundSnapshot,
  reveals: BaccaratRuntimeRevealSnapshot[],
  bets: BaccaratRuntimeBetSnapshot[],
) {
  if (!table.round) {
    table.round = createRoundRuntime(input);
  } else {
    table.round.status = input.status;
    table.round.bettingOpensAt = input.bettingOpensAt;
    table.round.bettingClosesAt = input.bettingClosesAt;
    table.round.playerTotal = input.playerTotal;
    table.round.bankerTotal = input.bankerTotal;
    table.round.outcome = input.outcome;
    table.round.isNatural = input.isNatural;
    table.round.totalCards = input.totalCards;

    if (table.round.playerCards.length === 0 && input.playerCards.length > 0) {
      table.round.playerCards = input.playerCards.map((card, index) => ({
        ...card,
        revealed: isRevealSlotRevealed(reveals, playerSlotForIndex(index)),
      }));
    }

    if (table.round.bankerCards.length === 0 && input.bankerCards.length > 0) {
      table.round.bankerCards = input.bankerCards.map((card, index) => ({
        ...card,
        revealed: isRevealSlotRevealed(reveals, bankerSlotForIndex(index)),
      }));
    }
  }

  table.reveals = reveals.map(createRevealRuntime);
  markRevealedCards(table.round, table.reveals);
  table.bets = createBetMap(bets);
  table.phase = toTablePhase(input.status);
}

function isRevealSlotRevealed(
  reveals: BaccaratRuntimeRevealSnapshot[],
  slot: BaccaratRevealSlot,
) {
  return reveals.some((reveal) => reveal.slot === slot && reveal.status === 'REVEALED');
}

function markRevealedCards(
  round: BaccaratRoundRuntime,
  reveals: BaccaratRevealRuntime[],
) {
  for (const reveal of reveals) {
    if (reveal.status !== 'REVEALED') {
      continue;
    }

    const card = getRuntimeCard(round, reveal.slot);

    if (card) {
      card.revealed = true;
    }
  }
}

function normalizeTableConfig(config: BaccaratTableConfig): BaccaratTableConfig {
  if (config.minBet <= 0n || config.maxMainBet < config.minBet) {
    throw new BaccaratTableError(
      'UNKNOWN_ERROR',
      'Baccarat betting limits are invalid.',
    );
  }

  if (config.maxTotalBetPerUser < config.maxMainBet) {
    throw new BaccaratTableError(
      'UNKNOWN_ERROR',
      'Baccarat maxTotalBetPerUser must be greater than or equal to maxMainBet.',
    );
  }

  return {
    ...config,
    status: normalizeTableStatus(config.status),
    betTypes: normalizeBetTypes(config.betTypes),
  };
}

function normalizeTableStatus(
  status: BaccaratTableStatus,
): BaccaratTableStatus {
  if (status === 'OPEN' || status === 'MAINTENANCE' || status === 'CLOSED') {
    return status;
  }

  throw new BaccaratTableError(
    'UNKNOWN_ERROR',
    `Unsupported Baccarat table status ${String(status)}.`,
  );
}

function normalizeBetTypes(betTypes: BaccaratBetType[]) {
  const uniqueBetTypes = Array.from(new Set(betTypes));

  if (
    uniqueBetTypes.length === 0 ||
    uniqueBetTypes.some(
      (betType) => betType !== 'PLAYER' && betType !== 'BANKER' && betType !== 'TIE',
    )
  ) {
    throw new BaccaratTableError(
      'UNKNOWN_ERROR',
      'Baccarat table has invalid bet types.',
    );
  }

  return uniqueBetTypes;
}

function normalizeTableId(tableId: string) {
  const normalizedTableId = tableId.trim();

  if (!normalizedTableId) {
    throw new BaccaratTableError('INVALID_TABLE_ID', 'tableId is required.');
  }

  return normalizedTableId;
}

function normalizeSocketUser(user?: BaccaratSocketUser): BaccaratSocketUser {
  if (!user) {
    throw new BaccaratTableError(
      'INVALID_SOCKET_USER',
      'Socket user requires userId and nickname.',
    );
  }

  const userId = user.userId.trim();
  const nickname = user.nickname.trim();

  if (!userId || !nickname) {
    throw new BaccaratTableError(
      'INVALID_SOCKET_USER',
      'Socket user requires userId and nickname.',
    );
  }

  return {
    userId,
    nickname,
    role: user.role,
  };
}

function normalizeProgress(progress: number) {
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw new BaccaratTableError(
      'SQUEEZE_RATE_LIMITED',
      'Squeeze progress must be an integer between 0 and 100.',
    );
  }

  return progress;
}

function assertTableOpen(table: BaccaratTableRuntime) {
  if (table.status !== 'OPEN') {
    throw new BaccaratTableError(
      'TABLE_NOT_OPEN',
      `Baccarat table ${table.tableId} is ${table.status}.`,
    );
  }
}

function isBettingWindowClosed(round: BaccaratRoundRuntime) {
  return Boolean(round.bettingClosesAt && Date.now() >= Date.parse(round.bettingClosesAt));
}

function requireRound(table: BaccaratTableRuntime): BaccaratRoundRuntime {
  if (!table.round) {
    throw new BaccaratTableError(
      'ROUND_NOT_FOUND',
      `Baccarat table ${table.tableId} does not have an active round.`,
    );
  }

  return table.round;
}

function requireActiveReveal(
  table: BaccaratTableRuntime,
  roundId: string,
  revealId: string,
) {
  const round = requireRound(table);

  if (round.roundId !== roundId.trim()) {
    throw new BaccaratTableError(
      'ROUND_NOT_FOUND',
      `Baccarat round ${roundId} is not active.`,
    );
  }

  const reveal = table.reveals.find(
    (candidate) => candidate.revealId === revealId.trim(),
  );

  if (!reveal || reveal.status !== 'ACTIVE') {
    throw new BaccaratTableError(
      'REVEAL_NOT_ACTIVE',
      `Baccarat reveal ${revealId} is not active.`,
    );
  }

  return reveal;
}

function requireRevealCard(
  round: BaccaratRoundRuntime,
  slot: BaccaratRevealSlot,
) {
  const card = getRuntimeCard(round, slot);

  if (!card) {
    throw new BaccaratTableError(
      'INVALID_REVEAL_ID',
      `Baccarat slot ${slot} does not have a card.`,
    );
  }

  card.revealed = true;

  return {
    rank: card.rank,
    suit: card.suit,
  };
}

function getRuntimeCard(
  round: BaccaratRoundRuntime,
  slot: BaccaratRevealSlot,
): BaccaratRuntimeCard | null {
  if (slot.startsWith('PLAYER')) {
    return round.playerCards[playerIndexForSlot(slot)] ?? null;
  }

  return round.bankerCards[bankerIndexForSlot(slot)] ?? null;
}

function playerIndexForSlot(slot: BaccaratRevealSlot) {
  if (slot === 'PLAYER_CARD_1') {
    return 0;
  }

  if (slot === 'PLAYER_CARD_2') {
    return 1;
  }

  return 2;
}

function bankerIndexForSlot(slot: BaccaratRevealSlot) {
  if (slot === 'BANKER_CARD_1') {
    return 0;
  }

  if (slot === 'BANKER_CARD_2') {
    return 1;
  }

  return 2;
}

function playerSlotForIndex(index: number): BaccaratRevealSlot {
  return index === 0
    ? 'PLAYER_CARD_1'
    : index === 1
      ? 'PLAYER_CARD_2'
      : 'PLAYER_CARD_3';
}

function bankerSlotForIndex(index: number): BaccaratRevealSlot {
  return index === 0
    ? 'BANKER_CARD_1'
    : index === 1
      ? 'BANKER_CARD_2'
      : 'BANKER_CARD_3';
}

function chooseSqueezerUserId(table: BaccaratTableRuntime) {
  const connectedUserIds = new Set(
    Array.from(table.connections.values()).map((user) => user.userId),
  );
  const sortedBets = Array.from(table.bets.values())
    .filter((bet) => bet.status === 'PLACED' && connectedUserIds.has(bet.userId))
    .sort(
      (left, right) =>
        compareBigIntDesc(left.amount, right.amount) ||
        left.createdAt.localeCompare(right.createdAt),
    );

  return sortedBets[0]?.userId ?? null;
}

function compareBigIntDesc(left: bigint, right: bigint) {
  if (left > right) {
    return -1;
  }

  if (left < right) {
    return 1;
  }

  return 0;
}

function countUniqueViewers(table: BaccaratTableRuntime) {
  return new Set(
    Array.from(table.connections.values()).map((user) => user.userId),
  ).size;
}

function buildBettingSnapshot(
  table: BaccaratTableRuntime,
  viewerUserId?: string,
): BaccaratTableState['betting'] {
  const totals = {
    player: 0n,
    banker: 0n,
    tie: 0n,
  };

  for (const bet of table.bets.values()) {
    if (bet.status === 'CANCELLED') {
      continue;
    }

    if (bet.betType === 'PLAYER') {
      totals.player += bet.amount;
    } else if (bet.betType === 'BANKER') {
      totals.banker += bet.amount;
    } else {
      totals.tie += bet.amount;
    }
  }

  const myBet = viewerUserId ? table.bets.get(viewerUserId) : undefined;

  return {
    minBet: table.config.minBet.toString(),
    maxMainBet: table.config.maxMainBet.toString(),
    maxTotalBetPerUser: table.config.maxTotalBetPerUser.toString(),
    canPlaceBet:
      table.status === 'OPEN' &&
      table.phase === 'WAITING_BETS' &&
      Boolean(table.round && !isBettingWindowClosed(table.round)),
    betTypes: table.config.betTypes,
    totals: {
      player: totals.player.toString(),
      banker: totals.banker.toString(),
      tie: totals.tie.toString(),
    },
    participantCount: table.bets.size,
    myBet: myBet
      ? {
          betId: myBet.betId,
          betType: myBet.betType,
          betGroup: 'MAIN',
          amount: myBet.amount.toString(),
          status: myBet.status,
          payoutAmount: myBet.payoutAmount?.toString() ?? null,
          netAmount: myBet.netAmount?.toString() ?? null,
        }
      : null,
  };
}

function toRoundSnapshot(
  table: BaccaratTableRuntime,
  round: BaccaratRoundRuntime,
): BaccaratRoundSnapshot {
  const showResult = canShowFinalResult(table, round);

  return {
    roundId: round.roundId,
    shoeId: round.shoeId,
    roundNo: round.roundNo,
    status: round.status,
    outcome: showResult ? round.outcome : null,
    resultFlags: {
      isNatural: showResult ? round.isNatural : false,
      totalCards: showResult ? round.totalCards : null,
    },
  };
}

function toHandSnapshot(
  round: BaccaratRoundRuntime,
  target: 'PLAYER' | 'BANKER',
  phase: BaccaratTablePhase,
): BaccaratHandSnapshot {
  const cards = target === 'PLAYER' ? round.playerCards : round.bankerCards;
  const allRevealed = cards.length > 0 && cards.every((card) => card.revealed);
  const total = target === 'PLAYER' ? round.playerTotal : round.bankerTotal;

  return {
    cards: cards.map((card, index) =>
      toCardView(target === 'PLAYER' ? playerSlotForIndex(index) : bankerSlotForIndex(index), card),
    ),
    total:
      phase === 'SETTLING' ||
      phase === 'SETTLED' ||
      phase === 'ROUND_END' ||
      allRevealed
        ? total
        : null,
    isNatural:
      (phase === 'SETTLING' || phase === 'SETTLED' || phase === 'ROUND_END') &&
      round.isNatural,
  };
}

function emptyHand(): BaccaratHandSnapshot {
  return {
    cards: [],
    total: null,
    isNatural: false,
  };
}

function toCardView(
  slot: BaccaratRevealSlot,
  card: BaccaratRuntimeCard,
): BaccaratCardView {
  if (!card.revealed) {
    return {
      slot,
      hidden: true,
    };
  }

  return toVisibleCardView(slot, card);
}

function toVisibleCardView(
  slot: BaccaratRevealSlot,
  card: BaccaratCard,
): BaccaratVisibleCardView {
  return {
    slot,
    rank: card.rank,
    suit: card.suit as BaccaratCardSuit,
    value: getBaccaratCardValue(card) as BaccaratCardValue,
    hidden: false,
  };
}

function toRevealSnapshot(reveal: BaccaratRevealRuntime): BaccaratRevealSnapshot {
  return {
    revealId: reveal.revealId,
    slot: reveal.slot,
    squeezerUserId: reveal.squeezerUserId,
    status: reveal.status,
    startedAt: reveal.startedAt,
    endsAt: reveal.endsAt,
    revealedAt: reveal.revealedAt,
    progress: reveal.progress,
    isAutoReveal: reveal.squeezerUserId === null,
  };
}

function canShowFinalResult(
  table: BaccaratTableRuntime,
  round: BaccaratRoundRuntime,
) {
  return (
    table.phase === 'SETTLING' ||
    table.phase === 'SETTLED' ||
    table.phase === 'ROUND_END' ||
    table.reveals.every((reveal) => reveal.status === 'REVEALED') ||
    round.status === 'SETTLED'
  );
}

function toTablePhase(status: BaccaratRoundStatus): BaccaratTablePhase {
  if (status === 'WAITING_BETS') {
    return 'WAITING_BETS';
  }

  if (status === 'DEALING') {
    return 'DEALING';
  }

  if (status === 'SQUEEZE') {
    return 'SQUEEZE';
  }

  if (status === 'SETTLING') {
    return 'SETTLING';
  }

  if (status === 'SETTLED') {
    return 'SETTLED';
  }

  return 'CANCELLED';
}

function toSettledPlayerResult(
  table: BaccaratTableRuntime,
  bet: BaccaratSettlementBetInput,
): BaccaratRoundSettledPlayerResult {
  const runtimeBet = table.bets.get(bet.userId);

  return {
    playerId: bet.userId,
    nickname: runtimeBet?.nickname ?? bet.userId,
    betType: bet.betType,
    outcome: bet.outcome,
    betAmount: (runtimeBet?.amount ?? 0n).toString(),
    payoutAmount: bet.payoutAmount.toString(),
    netAmount: bet.netAmount.toString(),
  };
}

function buildRoadmapsFromRecentRounds(recentRounds: BaccaratRoundResultView[]) {
  return buildBaccaratRoadmaps(recentRounds);
}

function buildSyncKey(table: BaccaratTableRuntime) {
  return JSON.stringify({
    status: table.status,
    phase: table.phase,
    config: {
      minBet: table.config.minBet.toString(),
      maxMainBet: table.config.maxMainBet.toString(),
      maxTotalBetPerUser: table.config.maxTotalBetPerUser.toString(),
      bettingTimeoutSeconds: table.config.bettingTimeoutSeconds,
      squeezeTimeoutSeconds: table.config.squeezeTimeoutSeconds,
      roundEndDelaySeconds: table.config.roundEndDelaySeconds,
      betTypes: table.config.betTypes,
    },
    shoe: table.shoe,
    round: table.round
      ? {
          roundId: table.round.roundId,
          status: table.round.status,
          roundNo: table.round.roundNo,
          bettingClosesAt: table.round.bettingClosesAt,
          playerCards: table.round.playerCards.length,
          bankerCards: table.round.bankerCards.length,
        }
      : null,
    reveals: table.reveals.map((reveal) => ({
      revealId: reveal.revealId,
      status: reveal.status,
      progress: reveal.progress,
      squeezerUserId: reveal.squeezerUserId,
    })),
    bets: Array.from(table.bets.values()).map((bet) => ({
      betId: bet.betId,
      status: bet.status,
      payoutAmount: bet.payoutAmount?.toString() ?? null,
      netAmount: bet.netAmount?.toString() ?? null,
    })),
  });
}
