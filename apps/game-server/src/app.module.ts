import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BlackjackModule } from './blackjack/blackjack.module';
import { HealthModule } from './health/health.module';
import { RacingModule } from './racing/racing.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    AuthModule,
    BlackjackModule,
    RacingModule,
    WalletModule,
    HealthModule,
  ],
})
export class AppModule {}
