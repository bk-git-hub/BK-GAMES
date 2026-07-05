import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  RacingBetHistorySnapshot,
  RacingBetHistoryStatus,
  RacingBetType,
  RacingBetsResponse,
} from '@bk-games/shared';

const defaultTableId = 'main';
const defaultBetHistoryLimit = 20;
const maxBetHistoryLimit = 100;

@Injectable()
export class RacingBetsService {
  async listUserBets(input: RacingBetsRequest): Promise<RacingBetsResponse> {
    const tableId = normalizeTableId(input.tableId);
    const limit = normalizeBetHistoryLimit(input.limit);
    const userId = normalizeUserId(input.userId);
    const db = await this.loadDb();
    const table = await db.getRacingTableByCode(tableId);

    if (!table) {
      throw new NotFoundException(`Racing table ${tableId} was not found.`);
    }

    const bets = await db.listUserRacingBets({
      tableCode: tableId,
      userId,
      limit,
    });

    return {
      bets: bets.map(toBetHistorySnapshot),
    };
  }

  protected async loadDb(): Promise<RacingDbModule> {
    return (await import(dbPackageName)) as RacingDbModule;
  }
}

export type RacingBetsRequest = {
  userId: string;
  tableId?: string;
  limit?: string;
};

type RacingDbModule = {
  getRacingTableByCode(tableId: string): Promise<unknown | null>;
  listUserRacingBets(
    input: RacingDbBetHistoryRequest,
  ): Promise<RacingDbBetHistoryResult[]>;
};

type RacingDbBetHistoryRequest = {
  tableCode: string;
  userId: string;
  limit?: number;
};

type RacingDbBetHistoryResult = {
  bet: {
    id: string;
    raceId: string;
    raceNo: number;
    tableCode: string;
    betType: string;
    status: string;
    amount: bigint;
    payoutAmount: bigint;
    createdAt: Date;
    settledAt: Date | null;
  };
  selections: RacingDbBetHistorySelection[];
};

type RacingDbBetHistorySelection = {
  raceEntryId: string;
  entryNo: number;
  displayName: string;
  selectionOrder: number;
};

function toBetHistorySnapshot(
  result: RacingDbBetHistoryResult,
): RacingBetHistorySnapshot {
  return {
    betId: result.bet.id,
    raceId: result.bet.raceId,
    raceNo: result.bet.raceNo,
    tableId: result.bet.tableCode,
    betType: toRacingBetType(result.bet.betType),
    amount: result.bet.amount.toString(),
    status: toRacingBetHistoryStatus(result.bet.status),
    payoutAmount: result.bet.payoutAmount.toString(),
    createdAt: result.bet.createdAt.toISOString(),
    settledAt: result.bet.settledAt?.toISOString() ?? null,
    selections: result.selections.map((selection) => ({
      raceEntryId: selection.raceEntryId,
      entryNo: selection.entryNo,
      displayName: selection.displayName,
    })),
  };
}

function normalizeTableId(tableId: string | undefined) {
  const normalizedTableId = tableId?.trim() || defaultTableId;

  if (!/^[a-zA-Z0-9_-]+$/.test(normalizedTableId)) {
    throw new BadRequestException(
      'tableId may only contain letters, numbers, underscores, and hyphens.',
    );
  }

  return normalizedTableId;
}

function normalizeBetHistoryLimit(limit: string | undefined) {
  if (limit === undefined || limit.trim() === '') {
    return defaultBetHistoryLimit;
  }

  const parsedLimit = Number(limit);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    throw new BadRequestException('limit must be a positive integer.');
  }

  return Math.min(parsedLimit, maxBetHistoryLimit);
}

function normalizeUserId(userId: string) {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    throw new BadRequestException('userId is required.');
  }

  return normalizedUserId;
}

function toRacingBetType(value: string): RacingBetType {
  if (
    value === 'WIN' ||
    value === 'PLACE' ||
    value === 'QUINELLA' ||
    value === 'EXACTA' ||
    value === 'QUINELLA_PLACE' ||
    value === 'TRIO' ||
    value === 'TRIFECTA'
  ) {
    return value;
  }

  throw new BadRequestException(`Unsupported racing bet type ${value}.`);
}

function toRacingBetHistoryStatus(value: string): RacingBetHistoryStatus {
  if (
    value === 'PLACED' ||
    value === 'WON' ||
    value === 'LOST' ||
    value === 'CANCELLED'
  ) {
    return value;
  }

  throw new BadRequestException(`Unsupported racing bet status ${value}.`);
}

const dbPackageName: string = '@bk-games/db';
