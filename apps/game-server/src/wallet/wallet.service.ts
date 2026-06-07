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

  async doubleBlackjackBet(input: DoubleBlackjackBetInput) {
    const db = (await import(dbPackageName)) as BlackjackDbModule;

    return db.doubleBlackjackBet(input);
  }

  async splitBlackjackBet(input: SplitBlackjackBetInput) {
    const db = (await import(dbPackageName)) as BlackjackDbModule;

    return db.splitBlackjackBet(input);
  }

  async placeBlackjackInsuranceBet(input: PlaceBlackjackInsuranceBetInput) {
    const db = (await import(dbPackageName)) as BlackjackDbModule;

    return db.placeBlackjackInsuranceBet(input);
  }
}

export type PlaceBlackjackInitialBetInput = {
  tableId: string;
  seatNo: number;
  userId: string;
  amount: bigint;
  commandId: string;
};

export type DoubleBlackjackBetInput = {
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  userId: string;
  commandId: string;
};

export type SplitBlackjackBetInput = {
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  sourceHandNo: number;
  userId: string;
  commandId: string;
};

export type PlaceBlackjackInsuranceBetInput = {
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  userId: string;
  commandId: string;
};

type BlackjackDbModule = {
  placeBlackjackInitialBet(
    input: DbPlaceBlackjackInitialBetInput,
  ): Promise<BlackjackInitialBetResult>;
  doubleBlackjackBet(
    input: DoubleBlackjackBetInput,
  ): Promise<DoubleBlackjackBetResult>;
  splitBlackjackBet(
    input: SplitBlackjackBetInput,
  ): Promise<SplitBlackjackBetResult>;
  placeBlackjackInsuranceBet(
    input: PlaceBlackjackInsuranceBetInput,
  ): Promise<PlaceBlackjackInsuranceBetResult>;
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

export type DoubleBlackjackBetResult = {
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  userId: string;
  amount: bigint | string;
  totalWagerAmount: bigint | string;
  walletMutation: {
    wallet: { balance: bigint | string };
    ledger: {
      id: string;
      type: 'DOUBLE_BET';
      delta: bigint | string;
    };
  };
};

export type SplitBlackjackBetResult = {
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  sourceHandNo: number;
  newHandNo: number;
  userId: string;
  amount: bigint | string;
  totalWagerAmount: bigint | string;
  walletMutation: {
    wallet: { balance: bigint | string };
    ledger: {
      id: string;
      type: 'SPLIT_BET';
      delta: bigint | string;
    };
  };
};

export type PlaceBlackjackInsuranceBetResult = {
  roundId: string;
  roundSeatId: string;
  seatNo: number;
  userId: string;
  amount: bigint | string;
  walletMutation: {
    wallet: { balance: bigint | string };
    ledger: {
      id: string;
      type: 'INSURANCE_BET';
      delta: bigint | string;
    };
  };
};

export type BlackjackSettlementResult = {
  roundId: string;
  seats: BlackjackSettlementSeatResult[];
  sideBets: BlackjackSettlementSideBetResult[];
};

export type BlackjackSettlementSeatResult = {
  roundSeatId: string;
  handNo: number;
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

export type BlackjackSettlementSideBetResult = {
  roundSeatId: string;
  userId: string;
  seatNo: number;
  type: 'INSURANCE';
  outcome: 'WIN' | 'LOSE';
  outcomeReason: 'DEALER_BLACKJACK' | 'DEALER_NO_BLACKJACK';
  payoutAmount: bigint | string;
  netAmount: bigint | string;
  walletMutation: {
    wallet: { balance: bigint | string };
    ledger: {
      id: string;
      type: 'PAYOUT';
      delta: bigint | string;
    };
  } | null;
};

const dbPackageName: string = '@bk-games/db';
