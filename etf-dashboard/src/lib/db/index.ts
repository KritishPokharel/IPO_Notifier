import { SCHEMA_SQL } from "./schema";
import { ETFS } from "../etfs";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  /** Run a function inside a transaction (serialised on PGlite). */
  transaction<T>(fn: (tx: Pick<Db, "query">) => Promise<T>): Promise<T>;
}

const DATE_OID = 1082;
const TIMESTAMPTZ_OID = 1184;
const TIMESTAMP_OID = 1114;
const INT8_OID = 20;

/** Parse Postgres timestamp text ("2026-10-16 14:30:00.123456+00") into an ISO string. */
export const parseTs = (v: string) => {
  let t = v.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  t = t.replace(/(\.\d{3})\d+/, "$1");
  return new Date(t).toISOString();
};

async function createPgDb(url: string): Promise<Db> {
  const pg = await import("pg");
  const { Pool, types } = pg.default ?? pg;
  types.setTypeParser(DATE_OID, (v: string) => v);
  types.setTypeParser(TIMESTAMPTZ_OID, parseTs);
  types.setTypeParser(TIMESTAMP_OID, (v: string) => parseTs(v + "+00"));
  types.setTypeParser(INT8_OID, (v: string) => Number(v));
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
    async transaction<T>(fn: (tx: Pick<Db, "query">) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          query: async <R>(sql: string, params: unknown[] = []) =>
            (await client.query(sql, params)).rows as R[],
        });
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

/** Embedded Postgres (PGlite). `dataDir` undefined → in-memory (tests). */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const parsers = {
    [DATE_OID]: (v: string) => v,
    [TIMESTAMPTZ_OID]: parseTs,
    [TIMESTAMP_OID]: (v: string) => parseTs(v + "+00"),
    [INT8_OID]: (v: string) => Number(v),
  };
  if (dataDir) {
    const fs = await import("node:fs");
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const pg = dataDir ? new PGlite(dataDir, { parsers }) : new PGlite({ parsers });
  const db: Db = {
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pg.query<T>(sql, params);
      return res.rows;
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async close() {
      await pg.close();
    },
    async transaction<T>(fn: (tx: Pick<Db, "query">) => Promise<T>) {
      return pg.transaction(async (tx) =>
        fn({ query: async <R>(sql: string, params: unknown[] = []) => (await tx.query<R>(sql, params)).rows }),
      );
    },
  };
  return db;
}

export async function migrate(db: Db): Promise<void> {
  await db.exec(SCHEMA_SQL);
  for (const e of ETFS) {
    await db.query(
      `INSERT INTO etfs (ticker, name, provider, category, focus, expense_ratio, expense_ratio_status, expense_ratio_source)
       VALUES ($1, $2, $3, $4, $5, $6, 'reference', 'Project brief (initial reference value)')
       ON CONFLICT (ticker) DO UPDATE SET name = EXCLUDED.name, provider = EXCLUDED.provider,
         category = EXCLUDED.category, focus = EXCLUDED.focus`,
      [e.ticker, e.name, e.provider, e.category, e.focus, e.referenceExpenseRatio],
    );
  }
}

const globalForDb = globalThis as unknown as { __etfDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.__etfDb) {
    globalForDb.__etfDb = (async () => {
      const url = process.env.DATABASE_URL;
      const db = url ? await createPgDb(url) : await createPgliteDb(process.env.PGLITE_DIR ?? ".data/pglite");
      await migrate(db);
      return db;
    })().catch((e) => {
      globalForDb.__etfDb = undefined;
      throw e;
    });
  }
  return globalForDb.__etfDb;
}

export async function closeDb(): Promise<void> {
  if (globalForDb.__etfDb) {
    const db = await globalForDb.__etfDb;
    globalForDb.__etfDb = undefined;
    await db.close();
  }
}
