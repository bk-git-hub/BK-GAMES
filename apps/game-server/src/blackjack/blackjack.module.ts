import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { BlackjackGateway } from './blackjack.gateway';
import { BlackjackRoundService } from './blackjack-round.service';
import { BlackjackSettlementService } from './blackjack-settlement.service';
import { BlackjackTableConfigService } from './blackjack-table-config.service';
import { BlackjackTableService } from './blackjack-table.service';
import { BlackjackTablesController } from './blackjack-tables.controller';

@Module({
  imports: [AuthModule, WalletModule],
  controllers: [BlackjackTablesController],
  providers: [
    BlackjackGateway,
    BlackjackTableConfigService,
    BlackjackTableService,
    BlackjackRoundService,
    BlackjackSettlementService,
  ],
})
export class BlackjackModule {}
