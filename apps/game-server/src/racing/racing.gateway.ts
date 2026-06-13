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
  type RacingClientEvent,
  type RacingJoinTablePayload,
  type RacingSocketErrorPayload,
  type RacingSocketUser,
} from '@bk-games/shared';
import { Server, Socket } from 'socket.io';
import { GameTokenService } from '../auth/game-token.service';
import { RacingTableConfigService } from './racing-table-config.service';
import {
  RacingTableError,
  RacingTableService,
  type RacingTableMutationResult,
} from './racing-table.service';

@WebSocketGateway({
  namespace: RACING_NAMESPACE,
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class RacingGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tableConfigService: RacingTableConfigService,
    private readonly tableService: RacingTableService,
    private readonly gameTokenService: GameTokenService,
  ) {}

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
    const config = await this.tableConfigService.getTableConfig(tableId);

    this.tableService.configureTable({ tableId, config });
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
  'INVALID_SOCKET_USER',
]);
