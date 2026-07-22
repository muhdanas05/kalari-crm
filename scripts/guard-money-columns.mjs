#!/usr/bin/env node
/**
 * Static guards over the migration SQL. Runs in `npm run verify`.
 *
 * These are cheap greps that catch the three failure modes this project cannot
 * absorb. They are static-only: they read the migration files and never touch a
 * database, so they run in CI with no credentials.
 *
 *   1. FLOAT MONEY      — CLAUDE.md §4: "Money is decimal or integer paise.
 *                         Never float. No exceptions."
 *   2. NAIVE DATETIMES  — CLAUDE.md §4: "Timezone is Asia/Kolkata, everywhere.
 *                         No naive datetimes."
 *   3. MISSING RLS      — VERIFIED against this project on 2026-07-17: a fresh
 *                         table in `public` ships with RLS OFF and grants
 *                         anon + authenticated arwdDxtm (INSERT/SELECT/UPDATE/
 *                         DELETE/TRUNCATE). A public table without RLS is
 *                         world-writable by anonymous internet users. This guard
 *                         is the difference between a locked ledger and an open
 *                         one — it is not a style check.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'supabase/migrations';
const failures = [];

function fail(file, line, rule, detail) {
  failures.push({ file, line, rule, detail });
}

/** Strip -- line comments and /* *\/ block comments so they don't trip greps. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
}

let files;
try {
  files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
} catch {
  console.log('guard: no supabase/migrations yet — nothing to check.');
  process.exit(0);
}

if (files.length === 0) {
  console.log('guard: no migrations yet — nothing to check.');
  process.exit(0);
}

// Tables created across all migrations, and which ones got RLS enabled anywhere.
const created = new Map(); // publicTableName -> {file, line}
const rlsEnabled = new Set();

for (const file of files) {
  const raw = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
  const sql = stripComments(raw);
  const lines = sql.split('\n');

  lines.forEach((rawText, i) => {
    const line = i + 1;

    // A type name can never appear inside a quoted string, but the word can:
    // a jsonb key `'money'`, or user-facing copy like "money owed can only be
    // chased by phone", both tripped FLOAT_MONEY. Blank the literals out (keeping
    // the quotes so the line still parses for the other rules).
    //
    // This narrows WHERE we look, not WHAT we catch: `balance money` outside a
    // string still fires. A guard that cries wolf on prose is a guard people
    // start ignoring, which is how the real one gets missed.
    const text = rawText.replace(/'(?:[^']|'')*'/g, "''");

    // ── 1. Float money ───────────────────────────────────────────────────────
    // Catch float/double/real/money types outright. `numeric` is allowed only
    // where it isn't money (e.g. a percentage), so we flag numeric on a column
    // whose name looks monetary.
    if (/\b(float4|float8|double\s+precision|\breal\b|\bmoney\b)\b/i.test(text)) {
      fail(file, line, 'FLOAT_MONEY', `float-class type: ${rawText.trim().slice(0, 90)}`);
    }
    const moneyish = /\b(\w*(?:amount|rate|total|subtotal|price|fee|paid|balance|outstanding|credited|vat|gst)\w*)\s+(numeric|decimal)/i.exec(
      text,
    );
    if (moneyish) {
      fail(
        file,
        line,
        'FLOAT_MONEY',
        `money column "${moneyish[1]}" uses ${moneyish[2]} — use bigint paise. ` +
          `numeric(12,2) silently rounds on assignment.`,
      );
    }
    // Money columns must carry the _paise suffix so the unit is unmissable.
    // Keep this word list in sync with `moneyish` above — they drifted once
    // ("balance" was in one and not the other) and the negative test caught it.
    const badName = /\b(\w*(?:amount|subtotal|total|rate|price|fee|paid|balance|outstanding|credited)\w*)\s+bigint/i.exec(
      text,
    );
    if (
      badName &&
      !/_paise\b/i.test(badName[1]) &&
      // Legitimate non-money bigints that happen to contain a money word.
      !/_(bp|days|count|no|num|id|seq|version)\b/i.test(badName[1])
    ) {
      fail(
        file,
        line,
        'PAISE_SUFFIX',
        `money column "${badName[1]}" is bigint but lacks the _paise suffix`,
      );
    }

    // ── 2. Naive datetimes ───────────────────────────────────────────────────
    // `\btimestamp\b` does NOT match "timestamptz" (no word boundary after
    // "timestamp"), so timestamptz passes cleanly. Anything else — bare
    // `timestamp`, `timestamp(3)`, or `timestamp without time zone` — is naive.
    //
    // The earlier version only matched `timestamp,` / `timestamp)` and so
    // sailed straight past `created_at timestamp not null`, which is how anyone
    // would actually write it. Found by negative-testing the guard.
    const ts = /\btimestamp\b(?:\s*\(\s*\d+\s*\))?(?:\s+(with|without)\s+time\s+zone)?/i.exec(
      text,
    );
    if (ts && (ts[1] || '').toLowerCase() !== 'with') {
      fail(
        file,
        line,
        'NAIVE_DATETIME',
        `naive timestamp — use timestamptz (CLAUDE.md §4: no naive datetimes): ` +
          `${text.trim().slice(0, 80)}`,
      );
    }

    // ── 3. RLS bookkeeping ───────────────────────────────────────────────────
    const create = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/i.exec(text);
    if (create) created.set(create[1], { file, line });

    const enable = /alter\s+table\s+public\.(\w+)\s+enable\s+row\s+level\s+security/i.exec(
      text,
    );
    if (enable) rlsEnabled.add(enable[1]);
  });
}

for (const [table, where] of created) {
  if (!rlsEnabled.has(table)) {
    fail(
      where.file,
      where.line,
      'MISSING_RLS',
      `public.${table} never gets "enable row level security". VERIFIED: fresh ` +
        `public tables grant anon+authenticated INSERT/SELECT/UPDATE/DELETE/TRUNCATE ` +
        `and ship with RLS OFF — this table would be world-writable.`,
    );
  }
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} guard violation(s):\n`);
  for (const f of failures) {
    console.error(`  ${f.file}:${f.line}  [${f.rule}]`);
    console.error(`    ${f.detail}\n`);
  }
  process.exit(1);
}

console.log(
  `✓ guards passed — ${files.length} migration(s), ${created.size} public table(s), all RLS-enabled.`,
);
