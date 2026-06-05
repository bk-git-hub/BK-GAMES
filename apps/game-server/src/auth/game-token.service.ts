import { Injectable } from '@nestjs/common';

export type GameTokenPayload = {
  userId: string;
  nickname: string;
  role: 'USER' | 'ADMIN';
};

@Injectable()
export class GameTokenService {
  verify(token: string): GameTokenPayload | null {
    void token;

    return null;
  }
}
