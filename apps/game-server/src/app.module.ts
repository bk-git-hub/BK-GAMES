import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BaccaratModule } from './baccarat/baccarat.module';
import { BlackjackModule } from './blackjack/blackjack.module';
import { HealthModule } from './health/health.module';
import { RacingModule } from './racing/racing.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    AuthModule,
    BaccaratModule,
    BlackjackModule,
    RacingModule,
    WalletModule,
    HealthModule,
  ],
})
export class AppModule {}
