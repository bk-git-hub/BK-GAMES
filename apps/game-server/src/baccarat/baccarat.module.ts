import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { BaccaratGateway } from './baccarat.gateway';
import { BaccaratTableConfigService } from './baccarat-table-config.service';
import { BaccaratTableService } from './baccarat-table.service';

@Module({
  imports: [AuthModule, WalletModule],
  providers: [
    BaccaratGateway,
    BaccaratTableConfigService,
    BaccaratTableService,
  ],
})
export class BaccaratModule {}
