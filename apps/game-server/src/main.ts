import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { AppModule } from './app.module';

config({ path: resolve(process.cwd(), '../../.env'), quiet: true });
config({ path: resolve(process.cwd(), '.env'), quiet: true });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = Number(process.env.GAME_SERVER_PORT ?? 4000);
  const host = process.env.GAME_SERVER_HOST ?? 'localhost';

  await app.listen(port, host);
}
void bootstrap();
