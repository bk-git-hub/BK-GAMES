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
  type RacingRaceTickSnapshot,
  type RacingSocketErrorPayload,
  type RacingSocketUser,
  type RacingTableState,
  type RacingWalletUpdatedPayload,
} from '@bk-games/shared';
import { Server, Socket } from 'socket.io';
import { GameTokenService } from '../auth/game-token.service';
import { WalletService } from '../wallet/wallet.service';
import { RacingTableConfigService } from './racing-table-config.service';
import type { RacingSettlementResult } from './racing-table-config.service';
import {
  RacingTableError,
  RacingTableService,
  type RacingTableMutationResult,
} from './racing-table.service';

const racingLobbyTableIds = ['main'] as const;
const racingScheduleSyncIntervalMs = 5_000;

@WebSocketGateway({
  namespace: RACING_NAMESPACE,
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class RacingGateway implements OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private scheduleSyncTimer?: NodeJS.Timeout;

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
      await this.configureRuntimeTable(body.tableId);
      const user = this.resolveSocketUser(socket, body.nickname);
      const update = this.tableService.joinTable({
        tableId: body.tableId,
        socketId: socket.id,
        user,
      });

      await this.joinRacingRooms(socket, update.state.tableId, user.userId);
      this.emitTableUpdate(update);
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
      const syncUpdate = await this.configureRuntimeTable(tableId);

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

  private async syncLobbyTables() {
    await Promise.all(
      racingLobbyTableIds.map((tableId) => this.syncRuntimeTable(tableId)),
    );
  }

  private async syncRuntimeTable(tableId: string) {
    try {
      const lifecycle = await this.tableConfigService.advanceRaceLifecycle(
        tableId,
      );
      this.emitSettlementWalletUpdates(lifecycle.settled);

      const update = await this.configureRuntimeTable(tableId);

      if (update) {
        this.emitTableUpdate(update);
      }

      this.emitRaceTickIfRunning(
        update?.state ?? this.tableService.getTableState(tableId),
      );
    } catch (error) {
      this.emitTableError(
        tableId,
        error,
        'Unexpected racing scheduler error.',
      );
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
    this.server.to(room).emit(RACING_SERVER_EVENTS.TABLE_EVENT, update.event);
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

  private emitRaceTickIfRunning(state: RacingTableState) {
    if (state.phase !== 'RUNNING' || !state.race) {
      return;
    }

    const tick = buildRaceTick(state);
    const update = this.tableService.recordRaceTick({
      tableId: state.tableId,
      tick,
    });

    this.emitTableUpdate(update);
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

  private emitError(
    socket: Socket,
    event: RacingClientEvent,
    error: unknown,
  ) {
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

    if (!this.gameTokenService.isDevAuthEnabled()) {
      throw new RacingGatewayError(
        'UNAUTHORIZED',
        'Game token is required.',
      );
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
  if (value === 'WIN' || value === 'QUINELLA' || value === 'EXACTA') {
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

function buildRaceTick(state: RacingTableState): RacingRaceTickSnapshot {
  const race = state.race;

  if (!race) {
    throw new RacingGatewayError('RACE_NOT_FOUND', 'No active race.');
  }

  const raceRunDurationMs = Math.max(
    1_000,
    (state.timing.raceAndResultSeconds - state.timing.roundEndDelaySeconds) *
      1000,
  );
  const startAt =
    Date.parse(race.startedAt ?? '') ||
    Date.parse(race.scheduledStartAt ?? '') ||
    Date.now();
  const elapsedMs = Math.max(0, Math.min(Date.now() - startAt, raceRunDurationMs));
  const elapsedRatio = elapsedMs / raceRunDurationMs;
  const positions = race.entries
    .map((entry) => {
      const speed = deterministicUnitScore(`${race.raceId}:${entry.raceEntryId}`);
      const progress = Math.min(
        0.995,
        Math.max(0, elapsedRatio * (0.82 + speed * 0.28)),
      );

      return {
        raceEntryId: entry.raceEntryId,
        progress,
        speed,
      };
    })
    .sort((left, right) => right.progress - left.progress)
    .map((position, index) => ({
      raceEntryId: position.raceEntryId,
      progress: Number(position.progress.toFixed(4)),
      rank: index + 1,
    }));

  return {
    raceId: race.raceId,
    elapsedMs,
    positions,
  };
}

function deterministicUnitScore(seed: string) {
  let hash = 2_166_136_261;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0) / 0xffffffff;
}
