import { Controller, Get, Query } from '@nestjs/common';
import type {
  RacingHorseStatsResponse,
  RacingRaceResultsResponse,
} from '@bk-games/shared';
import { RacingHistoryService } from './racing-history.service';

@Controller('racing')
export class RacingHistoryController {
  constructor(private readonly historyService: RacingHistoryService) {}

  @Get('races')
  listRaceResults(
    @Query('tableId') tableId?: string,
    @Query('date') date?: string,
    @Query('limit') limit?: string,
  ): Promise<RacingRaceResultsResponse> {
    return this.historyService.listRaceResults({ tableId, date, limit });
  }

  @Get('horses/stats')
  getHorseStats(
    @Query('tableId') tableId?: string,
    @Query('date') date?: string,
    @Query('limit') limit?: string,
  ): Promise<RacingHorseStatsResponse> {
    return this.historyService.getHorseStats({ tableId, date, limit });
  }
}
