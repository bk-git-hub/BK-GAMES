import { Controller, Get } from '@nestjs/common';
import type { RacingTablesResponse } from '@bk-games/shared';
import { RacingTableConfigService } from './racing-table-config.service';
import { RacingTableService } from './racing-table.service';

const racingLobbyTableIds = ['main'] as const;

@Controller('racing/tables')
export class RacingTablesController {
  constructor(
    private readonly tableConfigService: RacingTableConfigService,
    private readonly tableService: RacingTableService,
  ) {}

  @Get()
  async listTables(): Promise<RacingTablesResponse> {
    const tables = await Promise.all(
      racingLobbyTableIds.map(async (tableId) => {
        const [config, race] = await Promise.all([
          this.tableConfigService.getTableConfig(tableId),
          this.tableConfigService.getScheduledRace(tableId),
        ]);

        this.tableService.configureTable({ tableId, config, race });

        return this.tableService.getTableSummary(tableId);
      }),
    );

    return { tables };
  }
}
