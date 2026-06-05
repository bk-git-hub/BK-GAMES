import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import * as schema from "./schema";

const packageSrcDir = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(packageSrcDir, "../../../.env"), quiet: true });
config({ path: resolve(packageSrcDir, "../.env"), quiet: true });

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required to initialize the database client.",
  );
}

export const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });

export type Database = typeof db;
