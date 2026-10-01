import { DynamicModule, Module, Type } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { isCardGamesEnabled } from './card-games';
import { HealthModule } from './health/health.module';
import { RacingModule } from './racing/racing.module';
import { WalletModule } from './wallet/wallet.module';

type BaccaratModuleFile = typeof import('./baccarat/baccarat.module');
type BlackjackModuleFile = typeof import('./blackjack/blackjack.module');

@Module({
  imports: [AuthModule, RacingModule, WalletModule, HealthModule],
})
export class AppModule {
  // The switch cannot live in the decorator: main.ts imports this file before
  // dotenv has run, so a value from a .env file would not be visible yet.
  static register(
    cardGamesEnabled: boolean = isCardGamesEnabled(),
  ): DynamicModule {
    if (!cardGamesEnabled) {
      return { module: AppModule };
    }

    return { module: AppModule, imports: loadCardGameModules() };
  }
}

// Loaded on demand so that, with the switch off, Node never evaluates the
// blackjack or baccarat files and a load-time fault in dormant code cannot
// take the racing server down. require rather than import(): tsc keeps
// import() native here, which needs a '.js' specifier that jest cannot resolve.
function loadCardGameModules(): Type[] {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { BaccaratModule } =
    require('./baccarat/baccarat.module') as BaccaratModuleFile;
  const { BlackjackModule } =
    require('./blackjack/blackjack.module') as BlackjackModuleFile;
  /* eslint-enable @typescript-eslint/no-require-imports */

  return [BaccaratModule, BlackjackModule];
}
