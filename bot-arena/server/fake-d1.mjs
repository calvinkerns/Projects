// A stand-in for Cloudflare D1 backed by Node's built-in SQLite. Tests only.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  return {
    raw: db,
    prepare(sql) {
      const stmt = db.prepare(sql);
      let params = [];
      const bound = {
        bind(...args) { params = args; return bound; },
        async all() { return { results: stmt.all(...params) }; },
        async first() { return stmt.get(...params) ?? null; },
        async run() { stmt.run(...params); return { success: true }; },
      };
      return bound;
    },
    // Like D1, a batch runs in one transaction: all of it happens or none of it.
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
