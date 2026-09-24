import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import { after, before, test } from "node:test";

import { sql } from "drizzle-orm";

// A minimal Postgres wire-protocol server: it accepts any login, answers simple
// queries, and can drop the connection on demand to imitate a database outage.
const faults = { beginDrops: 0, statementDrops: 0 };
const received: string[] = [];

const server = net.createServer((socket) => {
  let buffer = Buffer.alloc(0);
  let started = false;
  let inTransaction = false;

  socket.on("error", () => undefined);
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    for (;;) {
      if (!started) {
        if (buffer.length < 8) return;
        const length = buffer.readInt32BE(0);
        if (buffer.length < length) return;
        const code = buffer.readInt32BE(4);
        buffer = buffer.subarray(length);

        if (code === 80877103) {
          socket.write("N");
          continue;
        }

        started = true;
        socket.write(
          Buffer.concat([message("R", int32(0)), message("Z", Buffer.from("I"))]),
        );
        continue;
      }

      if (buffer.length < 5) return;
      const type = String.fromCharCode(buffer[0]);
      const length = buffer.readInt32BE(1);
      if (buffer.length < 1 + length) return;
      const body = buffer.subarray(5, 1 + length);
      buffer = buffer.subarray(1 + length);

      if (type === "X") {
        socket.end();
        return;
      }

      const text = body.toString("utf8").replace(/\0$/, "").trim().toLowerCase();
      received.push(text);

      if (text.startsWith("begin") && faults.beginDrops > 0) {
        faults.beginDrops -= 1;
        socket.destroy();
        return;
      }

      if (isStatement(text) && faults.statementDrops > 0) {
        faults.statementDrops -= 1;
        socket.destroy();
        return;
      }

      let tag = "UPDATE 1";
      if (text.startsWith("begin")) {
        tag = "BEGIN";
        inTransaction = true;
      } else if (text.startsWith("commit")) {
        tag = "COMMIT";
        inTransaction = false;
      } else if (text.startsWith("rollback")) {
        tag = "ROLLBACK";
        inTransaction = false;
      }

      socket.write(
        Buffer.concat([
          message("C", Buffer.from(`${tag}\0`)),
          message("Z", Buffer.from(inTransaction ? "T" : "I")),
        ]),
      );
    }
  });
});

let client: typeof import("./client.js");

before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as net.AddressInfo;

  process.env.DATABASE_URL = `postgresql://test:test@127.0.0.1:${port}/test`;
  client = await import("./client.js");
});

after(async () => {
  await client.pool.end();
  server.close();
});

test("a connection dropped at BEGIN rejects without leaking pool clients", async (t) => {
  const logError = t.mock.method(console, "error", () => undefined);
  faults.beginDrops = 11;

  for (let attempt = 0; attempt < 11; attempt += 1) {
    await assert.rejects(client.db.transaction(async () => "unreachable"));
  }

  assert.equal(client.pool.totalCount, 0);
  assert.equal(client.pool.waitingCount, 0);
  assert.ok(
    logError.mock.calls.some((call) => call.arguments[0] === "[db] client error"),
  );

  const result = await client.db.transaction(async (tx) => {
    await tx.execute(sql`update t set x = 1`);
    return "committed";
  });

  assert.equal(result, "committed");
});

test("a connection dropped inside a transaction rejects and the pool recovers", async (t) => {
  t.mock.method(console, "error", () => undefined);
  faults.statementDrops = 1;

  await assert.rejects(
    client.db.transaction(async (tx) => {
      await tx.execute(sql`update t set x = 1`);
    }),
  );

  const result = await client.db.transaction(async (tx) => {
    await tx.execute(sql`update t set x = 2`);
    return "committed";
  });

  assert.equal(result, "committed");
  assert.equal(client.pool.totalCount, 1);
  assert.equal(client.pool.idleCount, 1);
});

test("a failed transaction callback rolls back and keeps the client", async () => {
  received.length = 0;

  await assert.rejects(
    client.db.transaction(async (tx) => {
      await tx.execute(sql`update t set x = 3`);
      throw new Error("rejected");
    }),
    /rejected/,
  );

  assert.deepEqual(received, ["begin", "update t set x = 3", "rollback"]);
  assert.equal(client.pool.totalCount, 1);
  assert.equal(client.pool.idleCount, 1);
});

test("transaction config reaches BEGIN", async () => {
  received.length = 0;

  await client.db.transaction(async () => undefined, {
    isolationLevel: "serializable",
    accessMode: "read only",
  });

  assert.equal(received[0], "begin isolation level serializable read only");
});

function isStatement(text: string) {
  return !/^(begin|commit|rollback|savepoint|release)/.test(text);
}

function int32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
}

function message(type: string, body: Buffer) {
  return Buffer.concat([Buffer.from(type), int32(body.length + 4), body]);
}
