import { Controller, Get } from '@nestjs/common';
import type { BlackjackTablesResponse } from '@bk-games/shared';
import { BlackjackTableConfigService } from './blackjack-table-config.service';
import { BlackjackTableService } from './blackjack-table.service';

const blackjackLobbyTableIds = ['main'] as const;

@Controller('blackjack/tables')
export class BlackjackTablesController {
  constructor(
    private readonly tableConfigService: BlackjackTableConfigService,
    private readonly tableService: BlackjackTableService,
  ) {}

  @Get()
  async listTables(): Promise<BlackjackTablesResponse> {
    const tables = await Promise.all(
      blackjackLobbyTableIds.map(async (tableId) => {
        const config = await this.tableConfigService.getTableConfig(tableId);

        this.tableService.configureTable({ tableId, config });

        return this.tableService.getTableSummary(tableId);
      }),
    );

    return { tables };
  }
}
