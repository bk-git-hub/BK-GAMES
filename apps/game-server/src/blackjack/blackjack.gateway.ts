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
  type BlackjackSocketErrorPayload,
  type BlackjackSocketUser,
  type BlackjackTakeSeatPayload,
} from '@bk-games/shared';
import { Server, Socket } from 'socket.io';
import { GameTokenService } from '../auth/game-token.service';
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

  constructor(
    private readonly tableService: BlackjackTableService,
    private readonly gameTokenService: GameTokenService,
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

  private handleCommand(
    socket: Socket,
    event: BlackjackClientEvent,
    command: () => void,
  ) {
    try {
      command();
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
