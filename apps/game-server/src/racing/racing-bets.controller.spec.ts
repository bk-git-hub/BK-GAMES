import { UnauthorizedException } from '@nestjs/common';
import { RacingBetsController } from './racing-bets.controller';

describe('RacingBetsController', () => {
  it('lists racing bets for the verified game-token user', async () => {
    const betsService = {
      listUserBets: jest.fn(async () => ({ bets: [] })),
    };
    const gameTokenService = {
      verify: jest.fn(() => ({
        userId: 'user-1',
        nickname: 'BK',
        role: 'USER',
      })),
    };
    const controller = new RacingBetsController(
      betsService as never,
      gameTokenService as never,
    );

    await expect(
      controller.listUserBets('Bearer token-1', 'main', '20'),
    ).resolves.toEqual({ bets: [] });

    expect(gameTokenService.verify).toHaveBeenCalledWith('token-1');
    expect(betsService.listUserBets).toHaveBeenCalledWith({
      userId: 'user-1',
      tableId: 'main',
      limit: '20',
    });
  });

  it('rejects missing and invalid game tokens', async () => {
    const betsService = {
      listUserBets: jest.fn(),
    };
    const gameTokenService = {
      verify: jest.fn(() => null),
    };
    const controller = new RacingBetsController(
      betsService as never,
      gameTokenService as never,
    );

    expect(() => controller.listUserBets(undefined)).toThrow(
      UnauthorizedException,
    );

    expect(() => controller.listUserBets('Bearer bad-token')).toThrow(
      UnauthorizedException,
    );
    expect(betsService.listUserBets).not.toHaveBeenCalled();
  });
});
