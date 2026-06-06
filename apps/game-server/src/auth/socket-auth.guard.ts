import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { GameTokenPayload } from '@bk-games/shared';
import { Socket } from 'socket.io';
import { GameTokenService } from './game-token.service';

@Injectable()
export class SocketAuthGuard implements CanActivate {
  constructor(private readonly gameTokenService: GameTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const socket = context.switchToWs().getClient<Socket>();
    const token = readSocketToken(socket);

    if (!token) {
      return false;
    }

    const user = this.gameTokenService.verify(token);

    if (!user) {
      return false;
    }

    const socketData = socket.data as SocketAuthData;

    socketData.user = user;

    return true;
  }
}

type SocketAuthData = {
  user?: GameTokenPayload;
};

function readSocketToken(socket: Socket) {
  const auth = socket.handshake.auth as SocketAuthShape | undefined;
  const token = auth?.token;

  if (typeof token === 'string' && token.trim()) {
    return token.trim();
  }

  return null;
}

type SocketAuthShape = {
  token?: unknown;
};
