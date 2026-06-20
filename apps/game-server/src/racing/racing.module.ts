import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { RacingGateway } from './racing.gateway';
import { RacingHistoryController } from './racing-history.controller';
import { RacingHistoryService } from './racing-history.service';
import { RacingTableConfigService } from './racing-table-config.service';
import { RacingTableService } from './racing-table.service';
import { RacingTablesController } from './racing-tables.controller';

@Module({
  imports: [AuthModule, WalletModule],
  controllers: [RacingTablesController, RacingHistoryController],
  providers: [
    RacingGateway,
    RacingHistoryService,
    RacingTableConfigService,
    RacingTableService,
  ],
})
export class RacingModule {}
