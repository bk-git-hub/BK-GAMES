import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  BLACKJACK_CLIENT_EVENTS,
  BLACKJACK_NAMESPACE,
  BLACKJACK_SERVER_EVENTS,
  blackjackTableRoom,
  blackjackUserRoom,
  type BlackjackClientEvent,
  type BlackjackJoinTablePayload,
  type BlackjackLeaveSeatPayload,
  type BlackjackPlaceBetPayload,
  type BlackjackPlayerActionPayload,
  type BlackjackSocketErrorPayload,
  type BlackjackSocketUser,
  type BlackjackTakeSeatPayload,
  type BlackjackWalletUpdatedPayload,
} from '@bk-games/shared';
import { Server, Socket } from 'socket.io';
import { GameTokenService } from '../auth/game-token.service';
import { WalletService } from '../wallet/wallet.service';
import {
  BlackjackTableError,
  BlackjackTableService,
  type BlackjackTableMutationResult,
} from './blackjack-table.service';

@WebSocketGateway({
  namespace: BLACKJACK_NAMESPACE,
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class BlackjackGateway {
  @WebSocketServer()
  server!: Server;

  private readonly bettingWindowTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly tableService: BlackjackTableService,
    private readonly gameTokenService: GameTokenService,
    private readonly walletService: WalletService,
  ) {}

  handleDisconnect(socket: Socket) {
    const updates = this.tableService.disconnectSocket(socket.id);

    for (const update of updates) {
      this.emitTableUpdate(update);
    }
  }

  @SubscribeMessage(BLACKJACK_CLIENT_EVENTS.TABLE_JOIN)
  handleTableJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: BlackjackJoinTablePayload,
  ) {
    this.handleCommand(socket, BLACKJACK_CLIENT_EVENTS.TABLE_JOIN, () => {
      const user = this.resolveSocketUser(socket, body.nickname);
      const update = this.tableService.joinTable({
        tableId: body.tableId,
        socketId: socket.id,
        user,
      });

      void socket.join(blackjackTableRoom(update.state.tableId));
      void socket.join(blackjackUserRoom(user.userId));
      this.emitTableUpdate(update);
    });
  }

  @SubscribeMessage(BLACKJACK_CLIENT_EVENTS.SEAT_TAKE)
  handleSeatTake(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: BlackjackTakeSeatPayload,
  ) {
    this.handleCommand(socket, BLACKJACK_CLIENT_EVENTS.SEAT_TAKE, () => {
      const user = this.resolveSocketUser(socket, body.nickname);
      const update = this.tableService.takeSeat({
        tableId: body.tableId,
        seatNo: body.seatNo,
        socketId: socket.id,
        user,
        nickname: body.nickname,
      });

      void socket.join(blackjackTableRoom(update.state.tableId));
      void socket.join(blackjackUserRoom(user.userId));
      this.emitTableUpdate(update);
    });
  }

  @SubscribeMessage(BLACKJACK_CLIENT_EVENTS.SEAT_LEAVE)
  handleSeatLeave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: BlackjackLeaveSeatPayload,
  ) {
    this.handleCommand(socket, BLACKJACK_CLIENT_EVENTS.SEAT_LEAVE, () => {
      const user = this.resolveSocketUser(socket);
      const update = this.tableService.leaveSeat({
        tableId: body.tableId,
        seatNo: body.seatNo,
        socketId: socket.id,
        user,
      });

      void socket.join(blackjackTableRoom(update.state.tableId));
      void socket.join(blackjackUserRoom(user.userId));
      this.emitTableUpdate(update);
    });
  }

  @SubscribeMessage(BLACKJACK_CLIENT_EVENTS.BET_PLACE)
  handleBetPlace(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: BlackjackPlaceBetPayload,
  ) {
    void this.handleCommand(
      socket,
      BLACKJACK_CLIENT_EVENTS.BET_PLACE,
      async () => {
        const user = this.resolveSocketUser(socket);
        const amount = parsePointAmount(body.amount);
        const reservation = this.tableService.reserveBet({
          tableId: body.tableId,
          seatNo: body.seatNo,
          socketId: socket.id,
          user,
          amount,
          commandId: body.commandId,
        });

        try {
          const betResult = await this.walletService.placeBlackjackInitialBet({
            tableId: reservation.tableId,
            seatNo: reservation.seatNo,
            userId: user.userId,
            amount: reservation.amount,
            commandId: reservation.commandId,
          });
          const update = this.tableService.confirmBet({
            tableId: reservation.tableId,
            seatNo: reservation.seatNo,
            socketId: socket.id,
            user,
            amount: reservation.amount,
            commandId: reservation.commandId,
            roundId: betResult.round.id,
            roundSeatId: betResult.roundSeat.id,
          });

          void socket.join(blackjackTableRoom(update.state.tableId));
          void socket.join(blackjackUserRoom(user.userId));
          this.emitTableUpdate(update);
          this.emitWalletUpdated(user.userId, {
            balance: betResult.walletMutation.wallet.balance.toString(),
            delta: betResult.walletMutation.ledger.delta.toString(),
            reason: 'BET_PLACED',
            ledgerId: betResult.walletMutation.ledger.id,
          });
          await this.settleRoundIfNeeded(update);
        } catch (error) {
          if (reservation.kind === 'reserved') {
            this.tableService.cancelBetReservation({
              tableId: reservation.tableId,
              seatNo: reservation.seatNo,
              amount: reservation.amount,
              commandId: reservation.commandId,
            });
          }

          throw error;
        }
      },
    );
  }

  @SubscribeMessage(BLACKJACK_CLIENT_EVENTS.PLAYER_ACTION)
  handlePlayerAction(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: BlackjackPlayerActionPayload,
  ) {
    void this.handleCommand(
      socket,
      BLACKJACK_CLIENT_EVENTS.PLAYER_ACTION,
      async () => {
        const user = this.resolveSocketUser(socket);

        if (body.action === 'DOUBLE') {
          await this.handleDoubleDown(socket, body, user);
          return;
        }

        if (body.action === 'SPLIT') {
          await this.handleSplit(socket, body, user);
          return;
        }

        const update = this.tableService.playerAction({
          tableId: body.tableId,
          seatNo: body.seatNo,
          action: body.action,
          socketId: socket.id,
          user,
        });

        void socket.join(blackjackTableRoom(update.state.tableId));
        void socket.join(blackjackUserRoom(user.userId));
        this.emitTableUpdate(update);
        await this.settleRoundIfNeeded(update);
      },
    );
  }

  private async handleDoubleDown(
    socket: Socket,
    body: BlackjackPlayerActionPayload,
    user: BlackjackSocketUser,
  ) {
    const commandId = readRequiredCommandId(body.commandId, 'double down');
    const reservation = this.tableService.reserveDoubleDown({
      tableId: body.tableId,
      seatNo: body.seatNo,
      socketId: socket.id,
      user,
      commandId,
    });

    try {
      const doubleResult = await this.walletService.doubleBlackjackBet({
        roundId: reservation.roundId,
        roundSeatId: reservation.roundSeatId,
        seatNo: reservation.seatNo,
        userId: user.userId,
        commandId: reservation.commandId,
      });
      const update = this.tableService.confirmDoubleDown({
        tableId: reservation.tableId,
        seatNo: reservation.seatNo,
        handNo: reservation.handNo,
        socketId: socket.id,
        user,
        commandId: reservation.commandId,
        roundId: reservation.roundId,
        roundSeatId: reservation.roundSeatId,
        amount: toBigInt(doubleResult.amount),
      });

      void socket.join(blackjackTableRoom(update.state.tableId));
      void socket.join(blackjackUserRoom(user.userId));
      this.emitTableUpdate(update);
      this.emitWalletUpdated(user.userId, {
        balance: doubleResult.walletMutation.wallet.balance.toString(),
        delta: doubleResult.walletMutation.ledger.delta.toString(),
        reason: 'DOUBLE_BET',
        ledgerId: doubleResult.walletMutation.ledger.id,
      });
      await this.settleRoundIfNeeded(update);
    } catch (error) {
      if (reservation.kind === 'reserved') {
        this.tableService.cancelDoubleDownReservation({
          tableId: reservation.tableId,
          seatNo: reservation.seatNo,
          handNo: reservation.handNo,
          commandId: reservation.commandId,
        });
      }

      throw error;
    }
  }

  private async handleSplit(
    socket: Socket,
    body: BlackjackPlayerActionPayload,
    user: BlackjackSocketUser,
  ) {
    const commandId = readRequiredCommandId(body.commandId, 'split');
    const reservation = this.tableService.reserveSplit({
      tableId: body.tableId,
      seatNo: body.seatNo,
      socketId: socket.id,
      user,
      commandId,
    });

    try {
      const splitResult = await this.walletService.splitBlackjackBet({
        roundId: reservation.roundId,
        roundSeatId: reservation.roundSeatId,
        seatNo: reservation.seatNo,
        sourceHandNo: reservation.sourceHandNo,
        userId: user.userId,
        commandId: reservation.commandId,
      });
      const update = this.tableService.confirmSplit({
        tableId: reservation.tableId,
        seatNo: reservation.seatNo,
        socketId: socket.id,
        user,
        commandId: reservation.commandId,
        roundId: reservation.roundId,
        roundSeatId: reservation.roundSeatId,
        sourceHandNo: splitResult.sourceHandNo,
        newHandNo: splitResult.newHandNo,
        amount: toBigInt(splitResult.amount),
      });

      void socket.join(blackjackTableRoom(update.state.tableId));
      void socket.join(blackjackUserRoom(user.userId));
      this.emitTableUpdate(update);
      this.emitWalletUpdated(user.userId, {
        balance: splitResult.walletMutation.wallet.balance.toString(),
        delta: splitResult.walletMutation.ledger.delta.toString(),
        reason: 'SPLIT_BET',
        ledgerId: splitResult.walletMutation.ledger.id,
      });
      await this.settleRoundIfNeeded(update);
    } catch (error) {
      if (reservation.kind === 'reserved') {
        this.tableService.cancelSplitReservation({
          tableId: reservation.tableId,
          seatNo: reservation.seatNo,
          sourceHandNo: reservation.sourceHandNo,
          commandId: reservation.commandId,
        });
      }

      throw error;
    }
  }

  private handleCommand(
    socket: Socket,
    event: BlackjackClientEvent,
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

  private emitTableUpdate(update: BlackjackTableMutationResult) {
    const room = blackjackTableRoom(update.state.tableId);

    this.server
      .to(room)
      .emit(BLACKJACK_SERVER_EVENTS.TABLE_STATE, update.state);
    this.server
      .to(room)
      .emit(BLACKJACK_SERVER_EVENTS.TABLE_EVENT, update.event);
    this.scheduleBettingWindowIfNeeded(update);
  }

  private emitWalletUpdated(
    userId: string,
    payload: BlackjackWalletUpdatedPayload,
  ) {
    this.server
      .to(blackjackUserRoom(userId))
      .emit(BLACKJACK_SERVER_EVENTS.WALLET_UPDATED, payload);
  }

  private async settleRoundIfNeeded(update: BlackjackTableMutationResult) {
    if (!update.settlement) {
      return;
    }

    const settlement = await this.walletService.settleBlackjackRound(
      update.settlement,
    );

    for (const seat of settlement.seats) {
      if (!seat.walletMutation) {
        continue;
      }

      this.emitWalletUpdated(seat.userId, {
        balance: seat.walletMutation.wallet.balance.toString(),
        delta: seat.walletMutation.ledger.delta.toString(),
        reason: seat.walletMutation.ledger.type,
        ledgerId: seat.walletMutation.ledger.id,
      });
    }

    const settledUpdate = this.tableService.confirmSettlement({
      tableId: update.state.tableId,
      roundId: settlement.roundId,
      seats: settlement.seats.map((seat) => ({
        roundSeatId: seat.roundSeatId,
        handNo: seat.handNo,
        seatNo: seat.seatNo,
        outcome: seat.outcome,
        outcomeReason: seat.outcomeReason,
        payoutAmount: BigInt(seat.payoutAmount),
        netAmount: BigInt(seat.netAmount),
      })),
    });

    this.emitTableUpdate(settledUpdate);
  }

  private scheduleBettingWindowIfNeeded(update: BlackjackTableMutationResult) {
    const tableId = update.state.tableId;
    const existingTimer = this.bettingWindowTimers.get(tableId);

    if (existingTimer) {
      clearTimeout(existingTimer);
      this.bettingWindowTimers.delete(tableId);
    }

    if (
      update.state.phase !== 'WAITING_BETS' ||
      !update.state.timers.phaseEndsAt
    ) {
      return;
    }

    const delayMs = Math.max(
      0,
      new Date(update.state.timers.phaseEndsAt).getTime() - Date.now(),
    );
    const timer = setTimeout(() => {
      this.bettingWindowTimers.delete(tableId);
      void this.expireBettingWindow(tableId);
    }, delayMs);

    this.bettingWindowTimers.set(tableId, timer);
  }

  private async expireBettingWindow(tableId: string) {
    try {
      const update = this.tableService.expireBettingWindow({ tableId });

      if (!update) {
        return;
      }

      this.emitTableUpdate(update);
      await this.settleRoundIfNeeded(update);
    } catch (error) {
      this.server.to(blackjackTableRoom(tableId)).emit(
        BLACKJACK_SERVER_EVENTS.ERROR,
        isSocketErrorLike(error)
          ? { code: error.code, message: error.message }
          : {
              code: 'UNKNOWN_ERROR',
              message: 'Unexpected blackjack betting timer error.',
            },
      );
    }
  }

  private emitError(
    socket: Socket,
    event: BlackjackClientEvent,
    error: unknown,
  ) {
    const payload: BlackjackSocketErrorPayload =
      error instanceof BlackjackTableError
        ? { code: error.code, message: error.message, event }
        : error instanceof BlackjackGatewayError
          ? { code: error.code, message: error.message, event }
          : isSocketErrorLike(error)
            ? { code: error.code, message: error.message, event }
            : {
                code: 'UNKNOWN_ERROR',
                message: 'Unexpected blackjack socket error.',
                event,
              };

    socket.emit(BLACKJACK_SERVER_EVENTS.ERROR, payload);
  }

  private resolveSocketUser(
    socket: Socket,
    nicknameOverride?: string,
  ): BlackjackSocketUser {
    const token = readSocketToken(socket);

    if (token) {
      const user = this.gameTokenService.verify(token);

      if (!user) {
        throw new BlackjackGatewayError(
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
      throw new BlackjackGatewayError(
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

class BlackjackGatewayError extends Error {
  constructor(
    readonly code: BlackjackSocketErrorPayload['code'],
    message: string,
  ) {
    super(message);
    this.name = 'BlackjackGatewayError';
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

function parsePointAmount(amount: unknown) {
  if (typeof amount !== 'string' || !/^[1-9]\d*$/.test(amount.trim())) {
    throw new BlackjackGatewayError(
      'INVALID_BET_AMOUNT',
      'Bet amount must be a positive integer string.',
    );
  }

  return BigInt(amount.trim());
}

function readRequiredCommandId(commandId: unknown, actionName: string) {
  if (typeof commandId !== 'string' || !commandId.trim()) {
    throw new BlackjackGatewayError(
      'INVALID_COMMAND_ID',
      `commandId is required for ${actionName}.`,
    );
  }

  return commandId.trim();
}

function toBigInt(value: bigint | string) {
  return typeof value === 'bigint' ? value : BigInt(value);
}

function isSocketErrorLike(
  error: unknown,
): error is { code: BlackjackSocketErrorPayload['code']; message: string } {
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
  'INVALID_SEAT_NO',
  'INVALID_COMMAND_ID',
  'INVALID_BET_AMOUNT',
  'SEAT_OCCUPIED',
  'SEAT_NOT_OCCUPIED',
  'SEAT_NOT_OWNED',
  'SEAT_HAS_ACTIVE_BET',
  'SEAT_LIMIT_REACHED',
  'BETTING_CLOSED',
  'BET_ALREADY_PLACED',
  'BET_IN_PROGRESS',
  'BET_TOO_LOW',
  'BET_TOO_HIGH',
  'WALLET_NOT_FOUND',
  'WALLET_NOT_ACTIVE',
  'INSUFFICIENT_BALANCE',
  'IDEMPOTENCY_CONFLICT',
  'ROUND_NOT_ACTIVE',
  'NOT_YOUR_TURN',
  'ACTION_NOT_ALLOWED',
  'ROUND_NOT_FOUND',
  'ROUND_SEAT_NOT_FOUND',
  'INVALID_SETTLEMENT',
  'SETTLEMENT_CONFLICT',
  'INVALID_SOCKET_USER',
]);
