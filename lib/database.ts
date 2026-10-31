import { createClient, type Client, type InValue } from '@libsql/client';

let client: Client | undefined;
export function getClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error('Set TURSO_DATABASE_URL before starting Workhub.');
    if (process.env.VERCEL && !url.startsWith('libsql://') && !url.startsWith('https://'))
      throw new Error('Vercel requires a remote persistent database.');
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}
// Preserve prepared parameters and transactional writes across the runtime migration.
class Statement {
  constructor(readonly sql: string, readonly args: InValue[] = []) {}
  bind(...args: unknown[]) { return new Statement(this.sql, args as InValue[]); }
  async first<T = Record<string, unknown>>() {
    const result = await getClient().execute(this);
    return (result.rows[0] as T | undefined) ?? null;
  }
  async all<T = Record<string, unknown>>() {
    return { results: (await getClient().execute(this)).rows as T[] };
  }
  async run() { return getClient().execute(this); }
}
export const database = {
  prepare: (sql: string) => new Statement(sql),
  batch: (statements: Statement[]) => getClient().batch(statements, 'write'),
};
