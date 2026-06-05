import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { BlackjackGateway } from './blackjack.gateway';
import { BlackjackRoundService } from './blackjack-round.service';
import { BlackjackSettlementService } from './blackjack-settlement.service';
import { BlackjackTableService } from './blackjack-table.service';

@Module({
  imports: [WalletModule],
  providers: [
    BlackjackGateway,
    BlackjackTableService,
    BlackjackRoundService,
    BlackjackSettlementService,
  ],
})
export class BlackjackModule {}
