import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RacingGateway } from './racing.gateway';
import { RacingTableConfigService } from './racing-table-config.service';
import { RacingTableService } from './racing-table.service';
import { RacingTablesController } from './racing-tables.controller';

@Module({
  imports: [AuthModule],
  controllers: [RacingTablesController],
  providers: [RacingGateway, RacingTableConfigService, RacingTableService],
})
export class RacingModule {}
