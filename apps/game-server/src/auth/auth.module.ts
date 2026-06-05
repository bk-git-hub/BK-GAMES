import { Module } from '@nestjs/common';
import { GameTokenService } from './game-token.service';
import { SocketAuthGuard } from './socket-auth.guard';

@Module({
  providers: [GameTokenService, SocketAuthGuard],
  exports: [GameTokenService, SocketAuthGuard],
})
export class AuthModule {}
