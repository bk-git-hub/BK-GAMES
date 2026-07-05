import {
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import type { RacingBetsResponse } from '@bk-games/shared';
import { GameTokenService } from '../auth/game-token.service';
import { RacingBetsService } from './racing-bets.service';

@Controller('racing')
export class RacingBetsController {
  constructor(
    private readonly betsService: RacingBetsService,
    private readonly gameTokenService: GameTokenService,
  ) {}

  @Get('bets')
  listUserBets(
    @Headers('authorization') authorization?: string,
    @Query('tableId') tableId?: string,
    @Query('limit') limit?: string,
  ): Promise<RacingBetsResponse> {
    const token = readBearerToken(authorization);

    if (!token) {
      throw new UnauthorizedException('Game token is required.');
    }

    const user = this.gameTokenService.verify(token);

    if (!user) {
      throw new UnauthorizedException('Invalid or expired game token.');
    }

    return this.betsService.listUserBets({
      userId: user.userId,
      tableId,
      limit,
    });
  }
}

function readBearerToken(authorization: string | undefined) {
  const trimmedAuthorization = authorization?.trim();

  if (!trimmedAuthorization) {
    return null;
  }

  const [scheme, token] = trimmedAuthorization.split(/\s+/, 2);

  if (scheme.toLowerCase() !== 'bearer' || !token?.trim()) {
    return null;
  }

  return token.trim();
}
