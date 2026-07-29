import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { gameServerCorsOptions } from './cors';

config({ path: resolve(process.cwd(), '../../.env'), quiet: true });
config({ path: resolve(process.cwd(), '.env'), quiet: true });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(gameServerCorsOptions);

  const port = readPort(process.env.GAME_SERVER_PORT ?? process.env.PORT, 4000);
  const host =
    process.env.GAME_SERVER_HOST ??
    (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost');

  await app.listen(port, host);
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

void bootstrap();
