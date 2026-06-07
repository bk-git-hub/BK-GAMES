import { Injectable } from '@nestjs/common';
import {
  BlackjackTableError,
  type BlackjackTableConfig,
} from './blackjack-table.service';

@Injectable()
export class BlackjackTableConfigService {
  async getTableConfig(tableId: string): Promise<BlackjackTableConfig> {
    const db = (await import(dbPackageName)) as BlackjackDbModule;
    const table = await db.getBlackjackTableByCode(tableId);

    if (!table) {
      throw new BlackjackTableError(
        'TABLE_NOT_FOUND',
        `Blackjack table ${tableId} was not found.`,
      );
    }

    return {
      status: table.status,
      maxSeats: table.maxSeats,
      maxSeatsPerUser: table.maxSeatsPerUser,
      minInitialBet: BigInt(table.minInitialBet),
      maxInitialBet: BigInt(table.maxInitialBet),
      maxTotalBetPerSeat: BigInt(table.maxTotalBetPerSeat),
      maxTotalBetPerUser: BigInt(table.maxTotalBetPerUser),
      deckCount: table.deckCount,
      dealerHitsSoft17: table.dealerHitsSoft17,
      insuranceAllowed: table.insuranceAllowed,
      evenMoneyAllowed: table.evenMoneyAllowed,
      doubleAllowed: table.doubleAllowed,
      splitAllowed: table.splitAllowed,
      doubleAfterSplitAllowed: table.doubleAfterSplitAllowed,
      maxSplitHands: table.maxSplitHands,
      resplitAcesAllowed: table.resplitAcesAllowed,
      hitSplitAcesAllowed: table.hitSplitAcesAllowed,
      surrenderMode: table.surrenderMode,
      bettingWindowMs: table.bettingTimeoutSeconds * 1000,
    };
  }
}

type BlackjackDbModule = {
  getBlackjackTableByCode(tableId: string): Promise<BlackjackDbTable | null>;
};

type BlackjackDbTable = {
  status: 'OPEN' | 'MAINTENANCE' | 'CLOSED';
  minInitialBet: bigint | string;
  maxInitialBet: bigint | string;
  maxTotalBetPerSeat: bigint | string;
  maxTotalBetPerUser: bigint | string;
  maxSeats: number;
  maxSeatsPerUser: number;
  bettingTimeoutSeconds: number;
  deckCount: number;
  dealerHitsSoft17: boolean;
  insuranceAllowed: boolean;
  evenMoneyAllowed: boolean;
  surrenderMode: 'NONE' | 'LATE' | 'EARLY';
  doubleAllowed: boolean;
  doubleAfterSplitAllowed: boolean;
  splitAllowed: boolean;
  maxSplitHands: number;
  resplitAcesAllowed: boolean;
  hitSplitAcesAllowed: boolean;
};

const dbPackageName: string = '@bk-games/db';
