import { Injectable } from '@nestjs/common';

@Injectable()
export class WalletService {
  async placeBlackjackInitialBet(input: PlaceBlackjackInitialBetInput) {
    const db = (await import(dbPackageName)) as BlackjackDbModule;

    return db.placeBlackjackInitialBet({
      tableCode: input.tableId,
      seatNo: input.seatNo,
      userId: input.userId,
      amount: input.amount,
      commandId: input.commandId,
    });
  }
}

export type PlaceBlackjackInitialBetInput = {
  tableId: string;
  seatNo: number;
  userId: string;
  amount: bigint;
  commandId: string;
};

type BlackjackDbModule = {
  placeBlackjackInitialBet(
    input: DbPlaceBlackjackInitialBetInput,
  ): Promise<BlackjackInitialBetResult>;
};

type DbPlaceBlackjackInitialBetInput = {
  tableCode: string;
  seatNo: number;
  userId: string;
  amount: bigint;
  commandId: string;
};

export type BlackjackInitialBetResult = {
  round: { id: string };
  roundSeat: { id: string };
  walletMutation: {
    wallet: { balance: bigint | string };
    ledger: {
      id: string;
      delta: bigint | string;
    };
  };
};

const dbPackageName: string = '@bk-games/db';
