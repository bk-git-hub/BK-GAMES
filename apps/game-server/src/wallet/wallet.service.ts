import { Injectable } from '@nestjs/common';
import type { BlackjackSettlementRequest } from '../blackjack/blackjack-table.service';

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

  async settleBlackjackRound(input: BlackjackSettlementRequest) {
    const db = (await import(dbPackageName)) as BlackjackDbModule;

    return db.settleBlackjackRound({
      roundId: input.roundId,
      dealer: input.dealer,
      seats: input.seats,
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
  settleBlackjackRound(
    input: DbSettleBlackjackRoundInput,
  ): Promise<BlackjackSettlementResult>;
};

type DbPlaceBlackjackInitialBetInput = {
  tableCode: string;
  seatNo: number;
  userId: string;
  amount: bigint;
  commandId: string;
};

type DbSettleBlackjackRoundInput = Omit<BlackjackSettlementRequest, 'tableId'>;

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

export type BlackjackSettlementResult = {
  roundId: string;
  seats: BlackjackSettlementSeatResult[];
};

export type BlackjackSettlementSeatResult = {
  roundSeatId: string;
  userId: string;
  seatNo: number;
  outcome: BlackjackSettlementRequest['seats'][number]['outcome'];
  outcomeReason: BlackjackSettlementRequest['seats'][number]['outcomeReason'];
  payoutAmount: bigint | string;
  netAmount: bigint | string;
  walletMutation: {
    wallet: { balance: bigint | string };
    ledger: {
      id: string;
      type: 'PAYOUT' | 'PUSH_REFUND' | 'SURRENDER_REFUND';
      delta: bigint | string;
    };
  } | null;
};

const dbPackageName: string = '@bk-games/db';
