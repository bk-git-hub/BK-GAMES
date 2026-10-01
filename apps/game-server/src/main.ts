import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { inspect } from 'node:util';
import { AppModule } from './app.module';
import { isCardGamesEnabled } from './card-games';
import { gameServerCorsOptions } from './cors';

config({ path: resolve(process.cwd(), '../../.env'), quiet: true });
config({ path: resolve(process.cwd(), '.env'), quiet: true });

const processLogger = new Logger('Process');

// Last resort for a rejection that no call site handled. Node 24 would
// otherwise exit, dropping every table's in-memory state and every socket.
// Call sites should still catch and report their own errors.
process.on('unhandledRejection', (reason) => {
  processLogger.error('Unhandled promise rejection', describe(reason));
});

async function bootstrap() {
  // Read here, after dotenv, so a value set in a .env file counts.
  const cardGamesEnabled = isCardGamesEnabled();

  if (cardGamesEnabled) {
    processLogger.log(
      'CARD_GAMES_ENABLED=true: registering blackjack and baccarat',
    );
  }

  const app = await NestFactory.create(AppModule.register(cardGamesEnabled));
  app.enableCors(gameServerCorsOptions);

  const port = readPort(process.env.GAME_SERVER_PORT ?? process.env.PORT, 4000);
  const host =
    process.env.GAME_SERVER_HOST ??
    (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost');

  await app.listen(port, host);
}

// inspect keeps what .stack drops: drizzle's wrapped pg error in .cause and
// the per-address errors of an AggregateError. It also never throws.
function describe(reason: unknown) {
  return inspect(reason, { depth: 5 });
}

function readPort(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid game server port: ${value}`);
  }

  return port;
}

bootstrap().catch((error: unknown) => {
  processLogger.error('Game server failed to start', describe(error));
  process.exit(1);
});
