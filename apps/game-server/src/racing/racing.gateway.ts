import { OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  RACING_CLIENT_EVENTS,
  RACING_NAMESPACE,
  RACING_SERVER_EVENTS,
  racingTableRoom,
  racingUserRoom,
  type RacingBetType,
  type RacingClientEvent,
  type RacingJoinTablePayload,
  type RacingPlaceBetPayload,
  type RacingTableEventPayload,
  type RacingSocketErrorPayload,
  type RacingSocketUser,
  type RacingTableState,
  type RacingWalletUpdatedPayload,
} from '@bk-games/shared';
import { Server, Socket } from 'socket.io';
import { GameTokenService } from '../auth/game-token.service';
import { gameServerCorsOptions } from '../cors';
import { WalletService } from '../wallet/wallet.service';
import { RacingTableConfigService } from './racing-table-config.service';
import type {
  RacingCancellationResult,
  RacingSettlementResult,
} from './racing-table-config.service';
import {
  RacingTableError,
  RacingTableService,
  type RacingTableMutationResult,
} from './racing-table.service';
import { buildRaceTick } from './racing-race-tick';

const racingLobbyTableIds = ['main'] as const;
const racingScheduleSyncIntervalMs = 60_000;
const racingPrestartLeadMs = 5_000;
const racingPrestartTickIntervalMs = 100;
const minimumRaceTickIntervalMs = 10;
const racingLifecycleRetryDelayMs = 100;

@WebSocketGateway({
  namespace: RACING_NAMESPACE,
  cors: gameServerCorsOptions,
})
export class RacingGateway implements OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private scheduleSyncTimer?: NodeJS.Timeout;
  private readonly bettingCloseTimers = new Map<
    string,
    RacingBettingCloseTimer
  >();
  private readonly prestartTimers = new Map<string, RacingPrestartTimer>();
  private readonly raceTickTimers = new Map<string, RacingTickTimer>();
  private readonly roundEndTimers = new Map<string, RacingRoundEndTimer>();
  private readonly raceFinishRetryTimers = new Map<string, NodeJS.Timeout>();
  private readonly raceFinishesInFlight = new Set<string>();
  private readonly lifecycleCheckpointsInFlight = new Set<string>();

  constructor(
    private readonly tableConfigService: RacingTableConfigService,
    private readonly tableService: RacingTableService,
    private readonly gameTokenService: GameTokenService,
    private readonly walletService: WalletService,
  ) {}

  afterInit() {
    this.scheduleSyncTimer = setInterval(() => {
      void this.syncLobbyTables();
    }, racingScheduleSyncIntervalMs);
    void this.syncLobbyTables();
  }

  onModuleDestroy() {
    if (this.scheduleSyncTimer) {
      clearInterval(this.scheduleSyncTimer);
      this.scheduleSyncTimer = undefined;
    }

    for (const tableId of Array.from(this.prestartTimers.keys())) {
      this.stopPrestartTimer(tableId);
    }

    for (const tableId of Array.from(this.bettingCloseTimers.keys())) {
      this.stopBettingCloseTimer(tableId);
    }

    for (const timer of this.raceTickTimers.values()) {
      clearInterval(timer.handle);
    }

    for (const timer of this.roundEndTimers.values()) {
      clearTimeout(timer.handle);
    }

    for (const timer of this.raceFinishRetryTimers.values()) {
      clearTimeout(timer);
    }

    this.raceTickTimers.clear();
    this.roundEndTimers.clear();
    this.raceFinishRetryTimers.clear();
    this.raceFinishesInFlight.clear();
    this.lifecycleCheckpointsInFlight.clear();
  }

  handleDisconnect(socket: Socket) {
    const updates = this.tableService.disconnectSocket(socket.id);

    for (const update of updates) {
      this.emitTableUpdate(update);
    }
  }

  @SubscribeMessage(RACING_CLIENT_EVENTS.TABLE_JOIN)
  handleTableJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RacingJoinTablePayload,
  ) {
    this.handleCommand(socket, RACING_CLIENT_EVENTS.TABLE_JOIN, async () => {
      const tableId = readRequiredTableId(body.tableId);
      const syncUpdate = await this.refreshRuntimeTable(tableId);
      const user = this.resolveSocketUser(socket, body.nickname, {
        allowGuest: true,
      });
      const update = this.tableService.joinTable({
        tableId,
        socketId: socket.id,
        user,
      });

      await this.joinRacingRooms(socket, update.state.tableId, user.userId);
      this.emitTableUpdate(update);

      if (syncUpdate) {
        this.emitTableEvent(syncUpdate.event);
      }
    });
  }

  @SubscribeMessage(RACING_CLIENT_EVENTS.BET_PLACE)
  handleBetPlace(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: RacingPlaceBetPayload,
  ) {
    this.handleCommand(socket, RACING_CLIENT_EVENTS.BET_PLACE, async () => {
      const payload = body as Partial<RacingPlaceBetPayload> | undefined;
      const tableId = readRequiredTableId(payload?.tableId);
      const raceId = readRequiredRaceId(payload?.raceId);
      const syncUpdate = await this.refreshRuntimeTable(tableId);

      if (syncUpdate) {
        this.emitTableUpdate(syncUpdate);
      }

      const user = this.resolveSocketUser(socket);
      const race = this.tableService.requireCurrentRace({
        tableId,
        raceId,
      });
      const amount = parsePointAmount(payload?.amount);
      const commandId = readRequiredCommandId(payload?.commandId);
      const betType = parseRacingBetType(payload?.betType);
      const raceEntryIds = parseRaceEntryIds(payload?.raceEntryIds);
      const betResult = await this.walletService.placeRacingBet({
        raceId: race.raceId,
        userId: user.userId,
        amount,
        commandId,
        betType,
        raceEntryIds,
      });

      await this.joinRacingRooms(socket, tableId, user.userId);

      const update = this.tableService.recordBetPlaced({
        tableId,
        user,
        raceId: betResult.race.id,
        betId: betResult.bet.id,
        betType: betResult.bet.betType,
        raceEntryIds: betResult.selections.map(
          (selection) => selection.raceEntryId,
        ),
      });

      this.emitTableUpdate(update);
      this.emitWalletUpdated(user.userId, {
        balance: betResult.walletMutation.wallet.balance.toString(),
        delta: betResult.walletMutation.ledger.delta.toString(),
        reason: 'BET_PLACED',
        ledgerId: betResult.walletMutation.ledger.id,
      });
    });
  }

  private handleCommand(
    socket: Socket,
    event: RacingClientEvent,
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

  private async configureRuntimeTable(tableId: string) {
    const [config, race] = await Promise.all([
      this.tableConfigService.getTableConfig(tableId),
      this.tableConfigService.getScheduledRace(tableId),
    ]);

    return this.tableService.configureTable({ tableId, config, race });
  }

  private async refreshRuntimeTable(tableId: string, now?: Date) {
    return this.runLifecycleCheckpoint(tableId, async () => {
      const lifecycle = await this.tableConfigService.advanceRaceLifecycle(
        tableId,
        now,
      );
      this.emitSettlementWalletUpdates(lifecycle.settled);
      this.emitCancellationWalletUpdates(lifecycle.cancelled);

      return this.configureRuntimeTable(tableId);
    });
  }

  private async syncLobbyTables() {
    await Promise.all(
      racingLobbyTableIds.map((tableId) => this.syncRuntimeTable(tableId)),
    );
  }

  private async syncRuntimeTable(tableId: string) {
    if (!this.shouldKeepRuntimeActive(tableId)) {
      this.stopRuntimeTimers(tableId);
      return;
    }

    try {
      const update = await this.refreshRuntimeTable(tableId);

      if (update) {
        this.emitTableUpdate(update);
      } else if (this.tableService.hasTable(tableId)) {
        this.ensureRuntimeTimers(this.tableService.getTableState(tableId));
      }
    } catch (error) {
      this.emitTableError(tableId, error, 'Unexpected racing scheduler error.');
    }
  }

  private async runLifecycleCheckpoint<T>(
    tableId: string,
    command: () => Promise<T>,
  ): Promise<T | null> {
    if (this.lifecycleCheckpointsInFlight.has(tableId)) {
      return null;
    }

    this.lifecycleCheckpointsInFlight.add(tableId);

    try {
      return await command();
    } finally {
      this.lifecycleCheckpointsInFlight.delete(tableId);
    }
  }

  private async joinRacingRooms(
    socket: Socket,
    tableId: string,
    userId: string,
  ) {
    await Promise.all([
      socket.join(racingTableRoom(tableId)),
      socket.join(racingUserRoom(userId)),
    ]);
  }

  private emitTableUpdate(update: RacingTableMutationResult) {
    const room = racingTableRoom(update.state.tableId);

    this.server.to(room).emit(RACING_SERVER_EVENTS.TABLE_STATE, update.state);
    this.emitTableEvent(update.event);
    this.ensureRuntimeTimers(update.state);
  }

  private emitTableEvent(event: RacingTableEventPayload) {
    this.server
      .to(racingTableRoom(event.tableId))
      .emit(RACING_SERVER_EVENTS.TABLE_EVENT, event);
  }

  private emitWalletUpdated(
    userId: string,
    payload: RacingWalletUpdatedPayload,
  ) {
    this.server
      .to(racingUserRoom(userId))
      .emit(RACING_SERVER_EVENTS.WALLET_UPDATED, payload);
  }

  private emitSettlementWalletUpdates(
    settlement: RacingSettlementResult | null,
  ) {
    if (!settlement) {
      return;
    }

    for (const bet of settlement.bets) {
      if (!bet.walletMutation) {
        continue;
      }

      this.emitWalletUpdated(bet.userId, {
        balance: bet.walletMutation.wallet.balance.toString(),
        delta: bet.walletMutation.ledger.delta.toString(),
        reason: 'PAYOUT',
        ledgerId: bet.walletMutation.ledger.id,
      });
    }
  }

  private emitCancellationWalletUpdates(
    cancellation: RacingCancellationResult | null,
  ) {
    if (!cancellation) {
      return;
    }

    for (const bet of cancellation.bets) {
      this.emitWalletUpdated(bet.userId, {
        balance: bet.walletMutation.wallet.balance.toString(),
        delta: bet.walletMutation.ledger.delta.toString(),
        reason: 'CANCEL_REFUND',
        ledgerId: bet.walletMutation.ledger.id,
      });
    }
  }

  private ensureRuntimeTimers(state: RacingTableState) {
    if (!this.shouldKeepRuntimeActive(state.tableId)) {
      this.stopRuntimeTimers(state.tableId);
      return;
    }

    this.ensureBettingCloseTimer(state);
    this.ensurePrestartTimer(state);
    this.ensureRaceTickLoop(state);
    this.ensureRoundEndTimer(state);
  }

  private shouldKeepRuntimeActive(tableId: string) {
    if (!this.tableService.hasTable(tableId)) {
      return false;
    }

    return (
      this.tableService.getViewerCount(tableId) > 0 ||
      this.tableService.hasLiveBets(tableId)
    );
  }

  private stopRuntimeTimers(tableId: string) {
    this.stopBettingCloseTimer(tableId);
    this.stopPrestartTimer(tableId);
    this.stopRaceTickLoop(tableId);
    this.stopRoundEndTimer(tableId);
    this.stopRaceFinishRetry(tableId);
  }

  private ensureBettingCloseTimer(state: RacingTableState) {
    const race = getBettingRace(state);

    if (!race) {
      this.stopBettingCloseTimer(state.tableId);
      return;
    }

    const bettingClosesAtMs = Date.parse(race.bettingClosesAt);

    if (!Number.isFinite(bettingClosesAtMs)) {
      this.stopBettingCloseTimer(state.tableId);
      return;
    }

    const existing = this.bettingCloseTimers.get(state.tableId);

    if (
      existing?.raceId === race.raceId &&
      existing.bettingClosesAtMs === bettingClosesAtMs
    ) {
      return;
    }

    this.stopBettingCloseTimer(state.tableId);

    const delayMs = Math.max(0, bettingClosesAtMs - Date.now());

    const handle = setTimeout(() => {
      this.bettingCloseTimers.delete(state.tableId);
      this.closeBettingWindowFromTimer(
        state.tableId,
        race.raceId,
        bettingClosesAtMs,
      );
    }, delayMs);

    handle.unref?.();
    this.bettingCloseTimers.set(state.tableId, {
      bettingClosesAtMs,
      handle,
      raceId: race.raceId,
    });
  }

  private stopBettingCloseTimer(tableId: string) {
    const existing = this.bettingCloseTimers.get(tableId);

    if (!existing) {
      return;
    }

    clearTimeout(existing.handle);
    this.bettingCloseTimers.delete(tableId);
  }

  private closeBettingWindowFromTimer(
    tableId: string,
    raceId: string,
    bettingClosesAtMs: number,
  ) {
    try {
      const update = this.tableService.closeBettingWindow({
        tableId,
        raceId,
        bettingClosesAtMs,
      });

      if (update) {
        this.emitTableUpdate(update);
      }
    } catch (error) {
      this.emitTableError(
        tableId,
        error,
        'Unexpected racing betting close timer error.',
      );
    }
  }

  private ensurePrestartTimer(state: RacingTableState) {
    const race = getPrestartRace(state);

    if (!race) {
      this.stopPrestartTimer(state.tableId);
      return;
    }

    const scheduledStartAtMs = Date.parse(race.scheduledStartAt);

    if (!Number.isFinite(scheduledStartAtMs)) {
      this.stopPrestartTimer(state.tableId);
      return;
    }

    const existing = this.prestartTimers.get(state.tableId);

    if (
      existing?.raceId === race.raceId &&
      existing.scheduledStartAtMs === scheduledStartAtMs
    ) {
      return;
    }

    this.stopPrestartTimer(state.tableId);

    const delayMs = Math.max(
      0,
      scheduledStartAtMs - Date.now() - racingPrestartLeadMs,
    );

    if (delayMs === 0 && scheduledStartAtMs <= Date.now()) {
      this.startRaceFromPrestartTimer(
        state.tableId,
        race.raceId,
        scheduledStartAtMs,
      );
      return;
    }

    if (delayMs > 0) {
      const handle = setTimeout(() => {
        this.startPrestartTickLoop(
          state.tableId,
          race.raceId,
          scheduledStartAtMs,
        );
      }, delayMs);

      handle.unref?.();
      this.prestartTimers.set(state.tableId, {
        handle,
        mode: 'waiting',
        raceId: race.raceId,
        scheduledStartAtMs,
      });
      return;
    }

    this.startPrestartTickLoop(state.tableId, race.raceId, scheduledStartAtMs);
  }

  private startPrestartTickLoop(
    tableId: string,
    raceId: string,
    scheduledStartAtMs: number,
  ) {
    this.stopPrestartTimer(tableId);

    const handle = setInterval(() => {
      void this.emitPrestartTickOrStart(tableId, raceId, scheduledStartAtMs);
    }, racingPrestartTickIntervalMs);

    handle.unref?.();
    this.prestartTimers.set(tableId, {
      handle,
      mode: 'ticking',
      raceId,
      scheduledStartAtMs,
    });

    void this.emitPrestartTickOrStart(tableId, raceId, scheduledStartAtMs);
  }

  private stopPrestartTimer(tableId: string) {
    const existing = this.prestartTimers.get(tableId);

    if (!existing) {
      return;
    }

    if (existing.mode === 'ticking') {
      clearInterval(existing.handle);
    } else {
      clearTimeout(existing.handle);
    }

    this.prestartTimers.delete(tableId);
  }

  private async emitPrestartTickOrStart(
    tableId: string,
    raceId: string,
    scheduledStartAtMs: number,
  ) {
    const serverNowMs = Date.now();
    const remainingMs = scheduledStartAtMs - serverNowMs;

    if (remainingMs <= 0) {
      this.stopPrestartTimer(tableId);
      this.startRaceFromPrestartTimer(tableId, raceId, scheduledStartAtMs);
      return;
    }

    let state: RacingTableState;

    try {
      state = this.tableService.getTableState(tableId);
    } catch (error) {
      this.stopPrestartTimer(tableId);
      this.emitTableError(tableId, error, 'Unexpected racing prestart error.');
      return;
    }

    const race = getPrestartRace(state);

    if (
      !race ||
      race.raceId !== raceId ||
      Date.parse(race.scheduledStartAt) !== scheduledStartAtMs
    ) {
      this.ensurePrestartTimer(state);
      return;
    }

    const room = racingTableRoom(tableId);
    const event: RacingTableEventPayload = {
      tableId,
      type: 'PRESTART_TICK',
      actorUserId: 'SYSTEM',
      raceId,
      raceNo: race.raceNo,
      prestartTick: {
        scheduledStartAt: race.scheduledStartAt,
        serverNowMs,
        remainingMs,
      },
      stateVersion: state.version,
      createdAt: new Date(serverNowMs).toISOString(),
    };

    this.server.to(room).emit(RACING_SERVER_EVENTS.TABLE_EVENT, event);
  }

  private startRaceFromPrestartTimer(
    tableId: string,
    raceId?: string,
    scheduledStartAtMs?: number,
  ) {
    try {
      if (raceId && scheduledStartAtMs !== undefined) {
        const update = this.tableService.startScheduledRace({
          tableId,
          raceId,
          scheduledStartAtMs,
        });

        if (update) {
          this.emitTableUpdate(update);
          void this.persistRaceStartFromPrestartTimer(
            tableId,
            scheduledStartAtMs,
          );
          return;
        }
      }

      void this.persistRaceStartFromPrestartTimer(tableId, scheduledStartAtMs);
    } catch (error) {
      this.emitTableError(
        tableId,
        error,
        'Unexpected racing prestart timer error.',
      );
    }
  }

  private async persistRaceStartFromPrestartTimer(
    tableId: string,
    scheduledStartAtMs?: number,
  ) {
    try {
      const update = await this.refreshRuntimeTable(
        tableId,
        scheduledStartAtMs === undefined
          ? undefined
          : new Date(scheduledStartAtMs),
      );

      if (update) {
        this.emitTableUpdate(update);
        return;
      }

      if (this.tableService.hasTable(tableId)) {
        this.ensureRuntimeTimers(this.tableService.getTableState(tableId));
      }
    } catch (error) {
      this.emitTableError(
        tableId,
        error,
        'Unexpected racing prestart persistence error.',
      );
    }
  }

  private ensureRaceTickLoop(state: RacingTableState) {
    const activeRace = getActiveRunningRace(state);

    if (
      !activeRace ||
      this.raceFinishesInFlight.has(state.tableId) ||
      this.raceFinishRetryTimers.has(state.tableId)
    ) {
      this.stopRaceTickLoop(state.tableId);
      return;
    }

    const intervalMs = normalizeRaceTickIntervalMs(state.timing.tickIntervalMs);
    const existing = this.raceTickTimers.get(state.tableId);

    if (
      existing?.raceId === activeRace.raceId &&
      existing.intervalMs === intervalMs
    ) {
      return;
    }

    this.stopRaceTickLoop(state.tableId);

    const handle = setInterval(() => {
      this.emitRaceTickForTable(state.tableId);
    }, intervalMs);

    handle.unref?.();
    this.raceTickTimers.set(state.tableId, {
      handle,
      intervalMs,
      raceId: activeRace.raceId,
    });

    this.emitRaceTickFromState(state);
  }

  private stopRaceTickLoop(tableId: string) {
    const existing = this.raceTickTimers.get(tableId);

    if (!existing) {
      return;
    }

    clearInterval(existing.handle);
    this.raceTickTimers.delete(tableId);
  }

  private emitRaceTickForTable(tableId: string) {
    try {
      const state = this.tableService.getTableState(tableId);

      if (!getActiveRunningRace(state)) {
        this.stopRaceTickLoop(tableId);
        return;
      }

      this.emitRaceTickFromState(state);
    } catch (error) {
      this.stopRaceTickLoop(tableId);
      this.emitTableError(tableId, error, 'Unexpected racing tick error.');
    }
  }

  private emitRaceTickFromState(state: RacingTableState) {
    const tick = buildRaceTick(state);
    const update = this.tableService.recordRaceTick({
      tableId: state.tableId,
      tick,
    });

    this.emitTableUpdate(update);

    if (isRaceTickFinished(tick)) {
      this.stopRaceTickLoop(state.tableId);
      void this.persistRaceFinishFromTick(state.tableId);
    }
  }

  private async persistRaceFinishFromTick(tableId: string) {
    if (this.raceFinishesInFlight.has(tableId)) {
      return;
    }

    this.raceFinishesInFlight.add(tableId);
    let shouldRetry = false;

    try {
      const update = await this.refreshRuntimeTable(tableId);

      if (update) {
        this.emitTableUpdate(update);
      } else if (this.tableService.hasTable(tableId)) {
        shouldRetry = Boolean(
          getActiveRunningRace(this.tableService.getTableState(tableId)),
        );
      }
    } catch (error) {
      this.emitTableError(
        tableId,
        error,
        'Unexpected racing finish persistence error.',
      );
      shouldRetry = this.tableService.hasTable(tableId);
    } finally {
      this.raceFinishesInFlight.delete(tableId);

      if (shouldRetry && this.shouldKeepRuntimeActive(tableId)) {
        this.scheduleRaceFinishRetry(tableId);
      } else if (this.tableService.hasTable(tableId)) {
        this.ensureRuntimeTimers(this.tableService.getTableState(tableId));
      }
    }
  }

  private scheduleRaceFinishRetry(tableId: string) {
    this.stopRaceFinishRetry(tableId);

    const handle = setTimeout(() => {
      this.raceFinishRetryTimers.delete(tableId);
      void this.persistRaceFinishFromTick(tableId);
    }, racingLifecycleRetryDelayMs);

    handle.unref?.();
    this.raceFinishRetryTimers.set(tableId, handle);
  }

  private stopRaceFinishRetry(tableId: string) {
    const existing = this.raceFinishRetryTimers.get(tableId);

    if (!existing) {
      return;
    }

    clearTimeout(existing);
    this.raceFinishRetryTimers.delete(tableId);
  }

  private ensureRoundEndTimer(state: RacingTableState, minimumDelayMs = 0) {
    const race = getSettledRace(state);

    if (!race) {
      this.stopRoundEndTimer(state.tableId);
      return;
    }

    const scheduledStartAtMs = Date.parse(race.scheduledStartAt);
    const roundEndAtMs =
      scheduledStartAtMs + state.timing.raceAndResultSeconds * 1_000;

    if (!Number.isFinite(roundEndAtMs)) {
      this.stopRoundEndTimer(state.tableId);
      return;
    }

    const existing = this.roundEndTimers.get(state.tableId);

    if (
      existing?.raceId === race.raceId &&
      existing.roundEndAtMs === roundEndAtMs
    ) {
      return;
    }

    this.stopRoundEndTimer(state.tableId);

    const handle = setTimeout(
      () => {
        this.roundEndTimers.delete(state.tableId);
        void this.advanceRoundEndFromTimer(
          state.tableId,
          race.raceId,
          roundEndAtMs,
        );
      },
      Math.max(minimumDelayMs, roundEndAtMs - Date.now()),
    );

    handle.unref?.();
    this.roundEndTimers.set(state.tableId, {
      handle,
      raceId: race.raceId,
      roundEndAtMs,
    });
  }

  private stopRoundEndTimer(tableId: string) {
    const existing = this.roundEndTimers.get(tableId);

    if (!existing) {
      return;
    }

    clearTimeout(existing.handle);
    this.roundEndTimers.delete(tableId);
  }

  private async advanceRoundEndFromTimer(
    tableId: string,
    raceId: string,
    roundEndAtMs: number,
  ) {
    try {
      const state = this.tableService.getTableState(tableId);
      const race = getSettledRace(state);

      if (!race || race.raceId !== raceId) {
        this.ensureRuntimeTimers(state);
        return;
      }

      const update = await this.refreshRuntimeTable(
        tableId,
        new Date(roundEndAtMs),
      );

      if (update) {
        this.emitTableUpdate(update);
        return;
      }

      if (this.tableService.hasTable(tableId)) {
        const currentState = this.tableService.getTableState(tableId);

        if (getSettledRace(currentState)) {
          this.ensureRoundEndTimer(currentState, racingLifecycleRetryDelayMs);
        } else {
          this.ensureRuntimeTimers(currentState);
        }
      }
    } catch (error) {
      this.emitTableError(
        tableId,
        error,
        'Unexpected racing round end timer error.',
      );
    }
  }

  private emitTableError(
    tableId: string,
    error: unknown,
    fallbackMessage: string,
  ) {
    this.server.to(racingTableRoom(tableId)).emit(
      RACING_SERVER_EVENTS.ERROR,
      isSocketErrorLike(error)
        ? { code: error.code, message: error.message }
        : {
            code: 'UNKNOWN_ERROR',
            message: fallbackMessage,
          },
    );
  }

  private emitError(socket: Socket, event: RacingClientEvent, error: unknown) {
    const payload: RacingSocketErrorPayload =
      error instanceof RacingTableError
        ? { code: error.code, message: error.message, event }
        : error instanceof RacingGatewayError
          ? { code: error.code, message: error.message, event }
          : isSocketErrorLike(error)
            ? { code: error.code, message: error.message, event }
            : {
                code: 'UNKNOWN_ERROR',
                message: 'Unexpected racing socket error.',
                event,
              };

    socket.emit(RACING_SERVER_EVENTS.ERROR, payload);
  }

  private resolveSocketUser(
    socket: Socket,
    nicknameOverride?: string,
    options?: { allowGuest?: boolean },
  ): RacingSocketUser {
    const token = readSocketToken(socket);

    if (token) {
      const user = this.gameTokenService.verify(token);

      if (!user) {
        throw new RacingGatewayError(
          'UNAUTHORIZED',
          'Invalid or expired game token.',
        );
      }

      return {
        ...user,
        nickname: nicknameOverride?.trim() || user.nickname,
      };
    }

    if (options?.allowGuest) {
      return {
        userId: `guest:${socket.id}`,
        nickname: nicknameOverride?.trim() || `Guest ${socket.id.slice(0, 6)}`,
        role: 'USER',
      };
    }

    if (!this.gameTokenService.isDevAuthEnabled()) {
      throw new RacingGatewayError('UNAUTHORIZED', 'Game token is required.');
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

type RacingTickTimer = {
  handle: NodeJS.Timeout;
  intervalMs: number;
  raceId: string;
};

type RacingRoundEndTimer = {
  handle: NodeJS.Timeout;
  raceId: string;
  roundEndAtMs: number;
};

type RacingBettingCloseTimer = {
  bettingClosesAtMs: number;
  handle: NodeJS.Timeout;
  raceId: string;
};

type RacingPrestartTimer = {
  handle: NodeJS.Timeout;
  mode: 'waiting' | 'ticking';
  raceId: string;
  scheduledStartAtMs: number;
};

type RacingBettingRace = NonNullable<RacingTableState['race']> & {
  bettingClosesAt: string;
};

type RacingPrestartRace = NonNullable<RacingTableState['race']> & {
  scheduledStartAt: string;
};

class RacingGatewayError extends Error {
  constructor(
    readonly code: RacingSocketErrorPayload['code'],
    message: string,
  ) {
    super(message);
    this.name = 'RacingGatewayError';
  }
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

function isSocketErrorLike(
  error: unknown,
): error is { code: RacingSocketErrorPayload['code']; message: string } {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };

  return (
    typeof candidate.code === 'string' &&
    socketErrorCodes.has(candidate.code) &&
    typeof candidate.message === 'string'
  );
}

const socketErrorCodes = new Set<string>([
  'UNAUTHORIZED',
  'TABLE_NOT_FOUND',
  'TABLE_NOT_OPEN',
  'INVALID_TABLE_ID',
  'INVALID_COMMAND_ID',
  'INVALID_BET_AMOUNT',
  'INVALID_BET',
  'INVALID_SOCKET_USER',
  'RACE_NOT_FOUND',
  'RACE_ENTRY_NOT_FOUND',
  'BETTING_CLOSED',
  'BET_TOO_LOW',
  'BET_TOO_HIGH',
  'BET_ALREADY_PLACED',
  'WALLET_NOT_FOUND',
  'WALLET_NOT_ACTIVE',
  'INSUFFICIENT_BALANCE',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_SETTLEMENT',
  'SETTLEMENT_CONFLICT',
]);

function getActiveRunningRace(state: RacingTableState) {
  if (state.phase !== 'RUNNING' || !state.race) {
    return null;
  }

  return state.race;
}

function getSettledRace(state: RacingTableState) {
  if (
    state.phase !== 'SETTLED' ||
    !state.race ||
    !state.race.scheduledStartAt
  ) {
    return null;
  }

  return state.race as NonNullable<RacingTableState['race']> & {
    scheduledStartAt: string;
  };
}

function getBettingRace(state: RacingTableState): RacingBettingRace | null {
  if (state.phase !== 'BETTING' || !state.race?.bettingClosesAt) {
    return null;
  }

  return state.race as RacingBettingRace;
}

function getPrestartRace(state: RacingTableState): RacingPrestartRace | null {
  if (
    (state.phase !== 'BETTING' && state.phase !== 'LOCKING_BETS') ||
    !state.race?.scheduledStartAt
  ) {
    return null;
  }

  return state.race as RacingPrestartRace;
}

function isRaceTickFinished(tick: ReturnType<typeof buildRaceTick>) {
  return tick.positions.every((position) => position.progress >= 1);
}

function normalizeRaceTickIntervalMs(tickIntervalMs: number) {
  if (!Number.isFinite(tickIntervalMs)) {
    return minimumRaceTickIntervalMs;
  }

  return Math.max(minimumRaceTickIntervalMs, Math.trunc(tickIntervalMs));
}

function parsePointAmount(amount: unknown) {
  if (typeof amount !== 'string' || !/^[1-9]\d*$/.test(amount.trim())) {
    throw new RacingGatewayError(
      'INVALID_BET_AMOUNT',
      'Bet amount must be a positive integer string.',
    );
  }

  return BigInt(amount.trim());
}

function readRequiredTableId(tableId: unknown) {
  if (typeof tableId !== 'string' || !tableId.trim()) {
    throw new RacingGatewayError('INVALID_TABLE_ID', 'tableId is required.');
  }

  return tableId.trim();
}

function readRequiredRaceId(raceId: unknown) {
  if (typeof raceId !== 'string' || !raceId.trim()) {
    throw new RacingGatewayError('RACE_NOT_FOUND', 'raceId is required.');
  }

  return raceId.trim();
}

function readRequiredCommandId(commandId: unknown) {
  if (typeof commandId !== 'string' || !commandId.trim()) {
    throw new RacingGatewayError(
      'INVALID_COMMAND_ID',
      'commandId is required for racing bets.',
    );
  }

  return commandId.trim();
}

function parseRacingBetType(value: unknown): RacingBetType {
  if (
    value === 'WIN' ||
    value === 'PLACE' ||
    value === 'QUINELLA' ||
    value === 'EXACTA' ||
    value === 'QUINELLA_PLACE' ||
    value === 'TRIO' ||
    value === 'TRIFECTA'
  ) {
    return value;
  }

  throw new RacingGatewayError(
    'INVALID_BET',
    `Unsupported racing bet type ${String(value)}.`,
  );
}

function parseRaceEntryIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new RacingGatewayError(
      'INVALID_BET',
      'raceEntryIds must be an array.',
    );
  }

  const raceEntryIds = value.map((entryId) =>
    typeof entryId === 'string' ? entryId.trim() : '',
  );

  if (raceEntryIds.some((entryId) => !entryId)) {
    throw new RacingGatewayError(
      'INVALID_BET',
      'raceEntryIds must contain non-empty strings.',
    );
  }

  return raceEntryIds;
}
