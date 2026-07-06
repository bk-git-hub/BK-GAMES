import { OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  BACCARAT_CLIENT_EVENTS,
  BACCARAT_NAMESPACE,
  BACCARAT_SERVER_EVENTS,
  baccaratTableRoom,
  baccaratUserRoom,
  type BaccaratBetType,
  type BaccaratClientEvent,
  type BaccaratPlaceBetPayload,
  type BaccaratSocketErrorPayload,
  type BaccaratSocketUser,
  type BaccaratSqueezeCompletePayload,
  type BaccaratSqueezeProgressPayload,
  type BaccaratTableJoinPayload,
  type BaccaratTableLeavePayload,
  type BaccaratTableState,
  type BaccaratWalletUpdatedPayload,
} from '@bk-games/shared';
import { Server, Socket } from 'socket.io';
import { GameTokenService } from '../auth/game-token.service';
import { gameServerCorsOptions } from '../cors';
import { WalletService } from '../wallet/wallet.service';
import { BaccaratTableConfigService } from './baccarat-table-config.service';
import {
  BaccaratTableError,
  BaccaratTableService,
  type BaccaratRuntimeBetSnapshot,
  type BaccaratSettlementBetInput,
  type BaccaratTableMutationResult,
} from './baccarat-table.service';

const baccaratLobbyTableIds = ['main'] as const;
const baccaratDealingDelayMs = 350;
const baccaratSettledDisplayMs = 750;

@WebSocketGateway({
  namespace: BACCARAT_NAMESPACE,
  cors: gameServerCorsOptions,
})
export class BaccaratGateway implements OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly bettingTimers = new Map<string, NodeJS.Timeout>();
  private readonly dealingTimers = new Map<string, NodeJS.Timeout>();
  private readonly revealTimers = new Map<string, NodeJS.Timeout>();
  private readonly settledTimers = new Map<string, NodeJS.Timeout>();
  private readonly roundEndTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly tableConfigService: BaccaratTableConfigService,
    private readonly tableService: BaccaratTableService,
    private readonly gameTokenService: GameTokenService,
    private readonly walletService: WalletService,
  ) {}

  afterInit() {
    void Promise.all(
      baccaratLobbyTableIds.map((tableId) =>
        this.configureRuntimeTable(tableId, true),
      ),
    ).catch((error: unknown) =>
      this.emitTableError(
        'main',
        error,
        'Unexpected baccarat bootstrap error.',
      ),
    );
  }

  onModuleDestroy() {
    clearTimerMap(this.bettingTimers);
    clearTimerMap(this.dealingTimers);
    clearTimerMap(this.revealTimers);
    clearTimerMap(this.settledTimers);
    clearTimerMap(this.roundEndTimers);
  }

  handleDisconnect(socket: Socket) {
    const updates = this.tableService.disconnectSocket(socket.id);

    for (const update of updates) {
      this.emitTableUpdate(update);
    }
  }

  @SubscribeMessage(BACCARAT_CLIENT_EVENTS.TABLE_JOIN)
  handleTableJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: BaccaratTableJoinPayload,
  ) {
    this.handleCommand(socket, BACCARAT_CLIENT_EVENTS.TABLE_JOIN, async () => {
      const tableId = readRequiredTableId(body.tableId);

      await this.configureRuntimeTable(tableId);

      const user = this.resolveSocketUser(socket, body.nickname);
      const update = this.tableService.joinTable({
        tableId,
        socketId: socket.id,
        user,
      });

      await this.joinBaccaratRooms(socket, update.state.tableId, user.userId);
      this.emitTableUpdate(update);
      this.emitPersonalTableState(socket, update.state.tableId, user.userId);
    });
  }

  @SubscribeMessage(BACCARAT_CLIENT_EVENTS.TABLE_LEAVE)
  handleTableLeave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: BaccaratTableLeavePayload,
  ) {
    this.handleCommand(socket, BACCARAT_CLIENT_EVENTS.TABLE_LEAVE, async () => {
      const tableId = readRequiredTableId(body.tableId);

      await this.configureRuntimeTable(tableId);

      const user = this.resolveSocketUser(socket);
      const update = this.tableService.leaveTable({
        tableId,
        socketId: socket.id,
        user,
      });

      await socket.leave(baccaratTableRoom(update.state.tableId));
      this.emitTableUpdate(update);
    });
  }

  @SubscribeMessage(BACCARAT_CLIENT_EVENTS.BET_PLACE)
  handleBetPlace(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: BaccaratPlaceBetPayload,
  ) {
    this.handleCommand(socket, BACCARAT_CLIENT_EVENTS.BET_PLACE, async () => {
      const payload = body as Partial<BaccaratPlaceBetPayload> | undefined;
      const tableId = readRequiredTableId(payload?.tableId);

      await this.configureRuntimeTable(tableId);

      const user = this.resolveSocketUser(socket);
      const round = this.tableService.requireBettingRound({ tableId });
      const amount = parsePointAmount(payload?.amount);
      const commandId = readRequiredCommandId(payload?.commandId);
      const betType = parseBaccaratBetType(payload?.betType);

      socket.data.lastBaccaratBetCommand = {
        tableId,
        roundId: round.roundId,
        commandId,
      };

      const betResult = await this.walletService.placeBaccaratBet({
        tableId,
        roundId: round.roundId,
        userId: user.userId,
        amount,
        commandId,
        betType,
      });
      const bet = toRuntimeBetSnapshot(betResult.bet, user);
      const update = this.tableService.recordBetAccepted({
        tableId,
        socketId: socket.id,
        user,
        bet,
        commandId,
      });

      await this.joinBaccaratRooms(socket, update.state.tableId, user.userId);
      this.emitTableUpdate(update);

      if (update.betAccepted) {
        this.server
          .to(baccaratUserRoom(user.userId))
          .emit(BACCARAT_SERVER_EVENTS.BET_ACCEPTED, update.betAccepted);
      }

      this.emitWalletUpdated(user.userId, {
        balance: betResult.walletMutation.wallet.balance.toString(),
        delta: betResult.walletMutation.ledger.delta.toString(),
        reason: 'BET_PLACED',
        ledgerId: betResult.walletMutation.ledger.id,
      });
      this.emitPersonalTableState(socket, tableId, user.userId);
    });
  }

  @SubscribeMessage(BACCARAT_CLIENT_EVENTS.SQUEEZE_PROGRESS)
  handleSqueezeProgress(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: BaccaratSqueezeProgressPayload,
  ) {
    this.handleCommand(
      socket,
      BACCARAT_CLIENT_EVENTS.SQUEEZE_PROGRESS,
      async () => {
        const user = this.resolveSocketUser(socket);
        const update = this.tableService.recordSqueezeProgress({
          tableId: readRequiredTableId(body.tableId),
          roundId: readRequiredRoundId(body.roundId),
          revealId: readRequiredRevealId(body.revealId),
          user,
          progress: body.progress,
        });

        await this.tableConfigService.markRevealProgress({
          revealId: body.revealId,
          progress: body.progress,
        });
        this.emitTableUpdate(update);
      },
    );
  }

  @SubscribeMessage(BACCARAT_CLIENT_EVENTS.SQUEEZE_COMPLETE)
  handleSqueezeComplete(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: BaccaratSqueezeCompletePayload,
  ) {
    this.handleCommand(
      socket,
      BACCARAT_CLIENT_EVENTS.SQUEEZE_COMPLETE,
      async () => {
        const user = this.resolveSocketUser(socket);

        await this.completeReveal({
          tableId: readRequiredTableId(body.tableId),
          roundId: readRequiredRoundId(body.roundId),
          revealId: readRequiredRevealId(body.revealId),
          user,
        });
      },
    );
  }

  private handleCommand(
    socket: Socket,
    event: BaccaratClientEvent,
    command: () => void | Promise<void>,
  ) {
    try {
      void Promise.resolve(command()).catch((error: unknown) =>
        this.emitError(socket, event, error),
      );
    } catch (error) {
      this.emitError(socket, event, error);
    }
  }

  private async configureRuntimeTable(tableId: string, force = false) {
    if (!force && this.tableService.hasTable(tableId)) {
      this.ensureRuntimeTimers(this.tableService.getTableState(tableId));
      return null;
    }

    const snapshot = await this.tableConfigService.getRuntimeSnapshot(tableId);
    const update = this.tableService.configureTable(snapshot);

    if (update) {
      this.emitTableUpdate(update);
    } else {
      this.ensureRuntimeTimers(this.tableService.getTableState(tableId));
    }

    return update;
  }

  private async expireBettingWindow(tableId: string) {
    try {
      const state = this.tableService.getTableState(tableId);

      if (state.phase !== 'WAITING_BETS' || !state.round) {
        return;
      }

      const deal = await this.tableConfigService.dealRound({
        tableId,
        roundId: state.round.roundId,
      });
      const update = this.tableService.startDealing({
        tableId,
        round: deal.round,
        shoe: deal.shoe,
        reveals: deal.reveals,
      });

      this.emitTableUpdate(update);
    } catch (error) {
      this.emitTableError(
        tableId,
        error,
        'Unexpected baccarat betting timer error.',
      );
    }
  }

  private async advanceDealing(tableId: string) {
    try {
      await this.startNextReveal(tableId);
    } catch (error) {
      this.emitTableError(
        tableId,
        error,
        'Unexpected baccarat dealing timer error.',
      );
    }
  }

  private async startNextReveal(tableId: string) {
    const update = this.tableService.startNextReveal({ tableId });

    if (!update) {
      const state = this.tableService.getTableState(tableId);

      if (state.phase === 'SETTLING') {
        await this.settleRoundIfNeeded(state);
      }

      return;
    }

    if (update.state.reveal) {
      await this.tableConfigService.markRevealActive({
        revealId: update.state.reveal.revealId,
        squeezerUserId: update.state.reveal.squeezerUserId,
        startedAt: update.state.reveal.startedAt ?? new Date().toISOString(),
        endsAt: update.state.reveal.endsAt ?? new Date().toISOString(),
      });
    }

    this.emitTableUpdate(update);
  }

  private async completeReveal(input: {
    tableId: string;
    roundId: string;
    revealId: string;
    user?: BaccaratSocketUser;
    system?: boolean;
  }) {
    const update = this.tableService.completeActiveReveal(input);
    const card = update.cardRevealed?.card;

    if (card) {
      await this.tableConfigService.markRevealCompleted({
        revealId: input.revealId,
        revealedBy: input.system
          ? 'SYSTEM'
          : input.user?.userId ?? 'SYSTEM',
        revealedAt: update.cardRevealed?.createdAt ?? new Date().toISOString(),
        card: {
          rank: card.rank,
          suit: card.suit,
        },
      });
    }

    this.emitTableUpdate(update);

    if (update.state.phase === 'SETTLING') {
      await this.settleRoundIfNeeded(update.state);
      return;
    }

    await this.startNextReveal(input.tableId);
  }

  private async completeRevealFromTimer(tableId: string) {
    try {
      const state = this.tableService.getTableState(tableId);

      if (state.phase !== 'SQUEEZE' || !state.round || !state.reveal) {
        return;
      }

      await this.completeReveal({
        tableId,
        roundId: state.round.roundId,
        revealId: state.reveal.revealId,
        system: true,
      });
    } catch (error) {
      this.emitTableError(
        tableId,
        error,
        'Unexpected baccarat reveal timer error.',
      );
    }
  }

  private async settleRoundIfNeeded(state: BaccaratTableState) {
    if (state.phase !== 'SETTLING' || !state.round) {
      return;
    }

    const outcome = state.round.outcome;
    const playerTotal = state.player.total;
    const bankerTotal = state.banker.total;
    const totalCards = state.round.resultFlags.totalCards;

    if (
      !outcome ||
      playerTotal === null ||
      bankerTotal === null ||
      totalCards === null
    ) {
      throw new BaccaratTableError(
        'INVALID_SETTLEMENT',
        'Baccarat round is missing final settlement state.',
      );
    }

    const settlement = await this.walletService.settleBaccaratRound({
      roundId: state.round.roundId,
      outcome,
      playerTotal,
      bankerTotal,
      isNatural: state.round.resultFlags.isNatural,
      totalCards,
      playerCards: readVisibleCards(state.player.cards),
      bankerCards: readVisibleCards(state.banker.cards),
      resultFlags: {
        isNatural: state.round.resultFlags.isNatural,
        totalCards,
      },
      roadmapSnapshot: null,
    });

    this.emitBaccaratSettlementWalletUpdates(settlement);

    const recentRounds = await this.tableConfigService.listRecentSettledRounds(
      state.tableId,
    );
    const update = this.tableService.confirmSettlement({
      tableId: state.tableId,
      roundId: state.round.roundId,
      outcome,
      playerTotal,
      bankerTotal,
      isNatural: state.round.resultFlags.isNatural,
      totalCards,
      bets: settlement.bets.map(toSettlementBetInput),
      recentRounds,
    });

    this.emitTableUpdate(update);
  }

  private enterRoundEnd(tableId: string) {
    try {
      const state = this.tableService.getTableState(tableId);

      if (state.phase !== 'SETTLED') {
        return;
      }

      const roundEndsAt = new Date(
        Date.now() +
          this.getRoundEndDelaySeconds(state) * 1000,
      );
      const nextState = this.tableService.enterRoundEnd({
        tableId,
        roundEndsAt,
      });

      this.emitTableState(nextState);
      this.ensureRuntimeTimers(nextState);
    } catch (error) {
      this.emitTableError(
        tableId,
        error,
        'Unexpected baccarat round-end timer error.',
      );
    }
  }

  private async resetRound(tableId: string) {
    try {
      const snapshot = await this.tableConfigService.getNextRoundSnapshot(tableId);
      const round = snapshot.round;

      if (!round) {
        throw new BaccaratTableError(
          'ROUND_NOT_FOUND',
          `Baccarat table ${tableId} does not have a next round.`,
        );
      }

      const update = this.tableService.resetRound({
        ...snapshot,
        round,
      });

      this.emitTableUpdate(update);
    } catch (error) {
      this.emitTableError(
        tableId,
        error,
        'Unexpected baccarat round reset error.',
      );
    }
  }

  private getRoundEndDelaySeconds(state: BaccaratTableState) {
    return this.tableService.getRoundEndDelaySeconds(state.tableId);
  }

  private async joinBaccaratRooms(
    socket: Socket,
    tableId: string,
    userId: string,
  ) {
    await Promise.all([
      socket.join(baccaratTableRoom(tableId)),
      socket.join(baccaratUserRoom(userId)),
    ]);
  }

  private emitTableUpdate(update: BaccaratTableMutationResult) {
    this.emitTableState(update.state);

    const room = baccaratTableRoom(update.state.tableId);

    if (update.event) {
      this.server.to(room).emit(BACCARAT_SERVER_EVENTS.TABLE_EVENT, update.event);
    }

    if (update.squeezeProgressed) {
      this.server
        .to(room)
        .emit(BACCARAT_SERVER_EVENTS.SQUEEZE_PROGRESS, update.squeezeProgressed);
    }

    if (update.cardRevealed) {
      this.server
        .to(room)
        .emit(BACCARAT_SERVER_EVENTS.CARD_REVEALED, update.cardRevealed);
    }

    if (update.roundSettled) {
      this.server
        .to(room)
        .emit(BACCARAT_SERVER_EVENTS.ROUND_SETTLED, update.roundSettled);
    }
  }

  private emitTableState(state: BaccaratTableState) {
    const publicState = this.tableService.getTableState(state.tableId);

    this.server
      .to(baccaratTableRoom(state.tableId))
      .emit(BACCARAT_SERVER_EVENTS.TABLE_STATE, publicState);
    this.ensureRuntimeTimers(publicState);
  }

  private emitPersonalTableState(
    socket: Socket,
    tableId: string,
    userId: string,
  ) {
    socket.emit(
      BACCARAT_SERVER_EVENTS.TABLE_STATE,
      this.tableService.getTableState(tableId, userId),
    );
  }

  private emitWalletUpdated(
    userId: string,
    payload: BaccaratWalletUpdatedPayload,
  ) {
    this.server
      .to(baccaratUserRoom(userId))
      .emit(BACCARAT_SERVER_EVENTS.WALLET_UPDATED, payload);
  }

  private emitBaccaratSettlementWalletUpdates(
    settlement: Awaited<ReturnType<WalletService['settleBaccaratRound']>>,
  ) {
    for (const bet of settlement.bets) {
      if (!bet.walletMutation) {
        continue;
      }

      this.emitWalletUpdated(bet.userId, {
        balance: bet.walletMutation.wallet.balance.toString(),
        delta: bet.walletMutation.ledger.delta.toString(),
        reason: bet.ledgerType ?? bet.walletMutation.ledger.type,
        ledgerId: bet.walletMutation.ledger.id,
      });
    }
  }

  private ensureRuntimeTimers(state: BaccaratTableState) {
    this.scheduleBettingTimer(state);
    this.scheduleDealingTimer(state);
    this.scheduleRevealTimer(state);
    this.scheduleSettledTimer(state);
    this.scheduleRoundEndTimer(state);
  }

  private scheduleBettingTimer(state: BaccaratTableState) {
    resetTimer(this.bettingTimers, state.tableId);

    if (state.phase !== 'WAITING_BETS' || !state.timers.bettingEndsAt) {
      return;
    }

    const delayMs = Math.max(
      0,
      Date.parse(state.timers.bettingEndsAt) - Date.now(),
    );
    const handle = setTimeout(() => {
      this.bettingTimers.delete(state.tableId);
      void this.expireBettingWindow(state.tableId);
    }, delayMs);

    handle.unref?.();
    this.bettingTimers.set(state.tableId, handle);
  }

  private scheduleDealingTimer(state: BaccaratTableState) {
    resetTimer(this.dealingTimers, state.tableId);

    if (state.phase !== 'DEALING') {
      return;
    }

    const handle = setTimeout(() => {
      this.dealingTimers.delete(state.tableId);
      void this.advanceDealing(state.tableId);
    }, baccaratDealingDelayMs);

    handle.unref?.();
    this.dealingTimers.set(state.tableId, handle);
  }

  private scheduleRevealTimer(state: BaccaratTableState) {
    resetTimer(this.revealTimers, state.tableId);

    if (state.phase !== 'SQUEEZE' || !state.timers.revealEndsAt) {
      return;
    }

    const delayMs = Math.max(
      0,
      Date.parse(state.timers.revealEndsAt) - Date.now(),
    );
    const handle = setTimeout(() => {
      this.revealTimers.delete(state.tableId);
      void this.completeRevealFromTimer(state.tableId);
    }, delayMs);

    handle.unref?.();
    this.revealTimers.set(state.tableId, handle);
  }

  private scheduleSettledTimer(state: BaccaratTableState) {
    resetTimer(this.settledTimers, state.tableId);

    if (state.phase !== 'SETTLED') {
      return;
    }

    const handle = setTimeout(() => {
      this.settledTimers.delete(state.tableId);
      this.enterRoundEnd(state.tableId);
    }, baccaratSettledDisplayMs);

    handle.unref?.();
    this.settledTimers.set(state.tableId, handle);
  }

  private scheduleRoundEndTimer(state: BaccaratTableState) {
    resetTimer(this.roundEndTimers, state.tableId);

    if (state.phase !== 'ROUND_END' || !state.timers.roundEndsAt) {
      return;
    }

    const delayMs = Math.max(
      0,
      Date.parse(state.timers.roundEndsAt) - Date.now(),
    );
    const handle = setTimeout(() => {
      this.roundEndTimers.delete(state.tableId);
      void this.resetRound(state.tableId);
    }, delayMs);

    handle.unref?.();
    this.roundEndTimers.set(state.tableId, handle);
  }

  private emitTableError(
    tableId: string,
    error: unknown,
    fallbackMessage: string,
  ) {
    this.server.to(baccaratTableRoom(tableId)).emit(
      BACCARAT_SERVER_EVENTS.ERROR,
      isSocketErrorLike(error)
        ? { code: normalizeSocketErrorCode(error.code), message: error.message }
        : {
            code: 'UNKNOWN_ERROR',
            message: fallbackMessage,
          },
    );
  }

  private emitError(socket: Socket, event: BaccaratClientEvent, error: unknown) {
    const payload: BaccaratSocketErrorPayload =
      error instanceof BaccaratTableError
        ? { code: error.code, message: error.message, event }
        : isSocketErrorLike(error)
          ? {
              code: normalizeSocketErrorCode(error.code),
              message: error.message,
              event,
            }
          : {
              code: 'UNKNOWN_ERROR',
              message: 'Unexpected baccarat socket error.',
              event,
            };

    if (event === BACCARAT_CLIENT_EVENTS.BET_PLACE) {
      const body = socket.data?.lastBaccaratBetCommand as
        | { tableId?: string; roundId?: string; commandId?: string }
        | undefined;

      socket.emit(BACCARAT_SERVER_EVENTS.BET_REJECTED, {
        tableId: body?.tableId ?? 'main',
        roundId: body?.roundId ?? null,
        commandId: body?.commandId ?? null,
        code: payload.code,
        message: payload.message,
        createdAt: new Date().toISOString(),
      });
    }

    socket.emit(BACCARAT_SERVER_EVENTS.ERROR, payload);
  }

  private resolveSocketUser(
    socket: Socket,
    nicknameOverride?: string,
  ): BaccaratSocketUser {
    const token = readSocketToken(socket);

    if (token) {
      const user = this.gameTokenService.verify(token);

      if (!user) {
        throw new BaccaratTableError(
          'UNAUTHORIZED',
          'Invalid or expired game token.',
        );
      }

      return {
        ...user,
        nickname: nicknameOverride?.trim() || user.nickname,
      };
    }

    if (!this.gameTokenService.isDevAuthEnabled()) {
      throw new BaccaratTableError('UNAUTHORIZED', 'Game token is required.');
    }

    const auth = socket.handshake.auth as SocketAuthShape | undefined;
    const query = socket.handshake.query;
    const userId =
      readHandshakeValue(auth?.userId) ??
      readHandshakeValue(query.userId) ??
      `dev:${socket.id}`;
    const nickname =
      nicknameOverride?.trim() ||
      readHandshakeValue(auth?.nickname) ||
      readHandshakeValue(query.nickname) ||
      `Guest ${socket.id.slice(0, 6)}`;
    const role = readHandshakeValue(auth?.role) === 'ADMIN' ? 'ADMIN' : 'USER';

    return {
      userId,
      nickname,
      role,
    };
  }
}

type SocketAuthShape = {
  token?: unknown;
  userId?: unknown;
  nickname?: unknown;
  role?: unknown;
};

function clearTimerMap(timers: Map<string, NodeJS.Timeout>) {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }

  timers.clear();
}

function resetTimer(timers: Map<string, NodeJS.Timeout>, tableId: string) {
  const existing = timers.get(tableId);

  if (!existing) {
    return;
  }

  clearTimeout(existing);
  timers.delete(tableId);
}

function readSocketToken(socket: Socket) {
  const auth = socket.handshake.auth as SocketAuthShape | undefined;
  const token = auth?.token;

  if (typeof token === 'string' && token.trim()) {
    return token.trim();
  }

  return null;
}

function readHandshakeValue(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return readHandshakeValue(value[0]);
  }

  return null;
}

function readRequiredTableId(tableId: unknown) {
  if (typeof tableId !== 'string' || !tableId.trim()) {
    throw new BaccaratTableError('INVALID_TABLE_ID', 'tableId is required.');
  }

  return tableId.trim();
}

function readRequiredRoundId(roundId: unknown) {
  if (typeof roundId !== 'string' || !roundId.trim()) {
    throw new BaccaratTableError('ROUND_NOT_FOUND', 'roundId is required.');
  }

  return roundId.trim();
}

function readRequiredRevealId(revealId: unknown) {
  if (typeof revealId !== 'string' || !revealId.trim()) {
    throw new BaccaratTableError('INVALID_REVEAL_ID', 'revealId is required.');
  }

  return revealId.trim();
}

function readRequiredCommandId(commandId: unknown) {
  if (typeof commandId !== 'string' || !commandId.trim()) {
    throw new BaccaratTableError(
      'INVALID_COMMAND_ID',
      'commandId is required for baccarat bets.',
    );
  }

  return commandId.trim();
}

function parsePointAmount(amount: unknown) {
  if (typeof amount !== 'string' || !/^[1-9]\d*$/.test(amount.trim())) {
    throw new BaccaratTableError(
      'INVALID_BET_AMOUNT',
      'Bet amount must be a positive integer string.',
    );
  }

  return BigInt(amount.trim());
}

function parseBaccaratBetType(value: unknown): BaccaratBetType {
  if (value === 'PLAYER' || value === 'BANKER' || value === 'TIE') {
    return value;
  }

  throw new BaccaratTableError(
    'INVALID_BET_TYPE',
    `Unsupported baccarat bet type ${String(value)}.`,
  );
}

function toRuntimeBetSnapshot(
  bet: Awaited<ReturnType<WalletService['placeBaccaratBet']>>['bet'],
  user: BaccaratSocketUser,
): BaccaratRuntimeBetSnapshot {
  return {
    betId: bet.id,
    userId: user.userId,
    nickname: user.nickname,
    betType: bet.betType,
    amount: toBigInt(bet.amount),
    status: bet.status,
    payoutAmount: toBigInt(bet.payoutAmount),
    netAmount: toBigInt(bet.netAmount),
    commandId: bet.commandId,
    createdAt: toIsoString(bet.createdAt),
  };
}

function toSettlementBetInput(
  bet: Awaited<ReturnType<WalletService['settleBaccaratRound']>>['bets'][number],
): BaccaratSettlementBetInput {
  return {
    betId: bet.betId,
    userId: bet.userId,
    betType: bet.betType,
    outcome: bet.outcome,
    payoutAmount: toBigInt(bet.payoutAmount),
    netAmount: toBigInt(bet.netAmount),
  };
}

function readVisibleCards(cards: BaccaratTableState['player']['cards']) {
  return cards.map((card) => {
    if ('hidden' in card && card.hidden) {
      throw new BaccaratTableError(
        'INVALID_SETTLEMENT',
        'Cannot settle Baccarat with hidden cards.',
      );
    }

    return {
      rank: card.rank,
      suit: card.suit,
    };
  });
}

function normalizeSocketErrorCode(
  code: string,
): BaccaratSocketErrorPayload['code'] {
  if (code === 'INVALID_BET') {
    return 'INVALID_BET_AMOUNT';
  }

  if (socketErrorCodes.has(code)) {
    return code as BaccaratSocketErrorPayload['code'];
  }

  return 'UNKNOWN_ERROR';
}

function isSocketErrorLike(
  error: unknown,
): error is { code: string; message: string } {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };

  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

function toBigInt(value: bigint | string) {
  return typeof value === 'bigint' ? value : BigInt(value);
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

const socketErrorCodes = new Set<string>([
  'UNAUTHORIZED',
  'TABLE_NOT_FOUND',
  'TABLE_NOT_OPEN',
  'INVALID_TABLE_ID',
  'INVALID_COMMAND_ID',
  'INVALID_BET_TYPE',
  'INVALID_BET_AMOUNT',
  'INVALID_SOCKET_USER',
  'BETTING_CLOSED',
  'BET_ALREADY_PLACED',
  'BET_TOO_LOW',
  'BET_TOO_HIGH',
  'WALLET_NOT_FOUND',
  'WALLET_NOT_ACTIVE',
  'INSUFFICIENT_BALANCE',
  'IDEMPOTENCY_CONFLICT',
  'ROUND_NOT_ACTIVE',
  'ROUND_NOT_FOUND',
  'ROUND_CANCELLED',
  'REVEAL_NOT_ACTIVE',
  'NOT_SQUEEZER',
  'INVALID_REVEAL_ID',
  'SQUEEZE_RATE_LIMITED',
  'SQUEEZE_TIMEOUT',
  'SHOE_NOT_READY',
  'INVALID_SETTLEMENT',
  'SETTLEMENT_CONFLICT',
  'RECONNECT_STATE_UNAVAILABLE',
  'UNKNOWN_ERROR',
]);
