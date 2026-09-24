import { config } from "dotenv";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import * as schema from "./schema.js";

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

export const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  // pg's default of 0 leaves the OS idle time (about two hours on Linux)
  // before the first probe, so a dead peer would go unnoticed.
  keepAliveInitialDelayMillis: 10_000,
});

// Without this listener pg-pool re-emits idle client failures as an
// unhandled 'error' event, which terminates the process.
pool.on("error", (error) => {
  console.error("[db] idle client error", error);
});

// pg-pool only listens for errors while a client is idle. If the connection
// drops while a client is checked out, the client emits 'error' with no
// listener and the throw terminates the process. With a listener the pending
// query rejects instead, and pg-pool discards the client when it is released.
pool.on("connect", (client) => {
  client.on("error", (error) => {
    console.error("[db] client error", error);
  });
});

const database = drizzle(pool, { schema });

const clientDatabases = new WeakMap<
  pg.PoolClient,
  NodePgDatabase<typeof schema>
>();

function getClientDatabase(client: pg.PoolClient) {
  let clientDatabase = clientDatabases.get(client);

  if (!clientDatabase) {
    clientDatabase = drizzle(client, { schema });
    clientDatabases.set(client, clientDatabase);
  }

  return clientDatabase;
}

// drizzle's pool transaction runs BEGIN before its try/finally, so a BEGIN
// that fails on a dropped connection never releases its client. Each failure
// then holds a pool slot for good until every query times out waiting for a
// connection. Checking the client out here guarantees it is released.
const transaction: typeof database.transaction = async (
  run,
  transactionConfig,
) => {
  const client = await pool.connect();

  try {
    return await getClientDatabase(client).transaction(run, transactionConfig);
  } finally {
    client.release();
  }
};

export const db = Object.assign(database, { transaction });

export type Database = typeof db;
