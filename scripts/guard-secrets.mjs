#!/usr/bin/env node
/**
 * Scans every git-tracked file for credential material.
 *
 * CLAUDE.md §9: "No secrets in the repo. Ever. Not in a comment, not in a
 * fixture, not 'temporarily'."
 *
 * WHY THIS EXISTS: an earlier hand-rolled scan checked for `sbp_` tokens and
 * JWTs, and cheerfully passed a commit containing `supabase/.temp/pooler-url`
 * — which holds the live database password inside a postgresql:// connection
 * string. It was caught by eye, not by the check. A secret scan that only
 * looks for the shapes you already thought of gives false confidence, so
 * connection strings are now first-class here.
 *
 * Runs against `git ls-files` — exactly what would be pushed — rather than the
 * working tree, which legitimately contains gitignored files full of secrets.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  {
    name: 'DB_CONNECTION_STRING',
    // postgres://user:password@host — the shape that got through before.
    re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/i,
    note: 'connection string with an embedded password',
  },
  { name: 'SUPABASE_PAT', re: /\bsbp_[a-f0-9]{40}\b/, note: 'Supabase personal access token' },
  {
    name: 'JWT',
    // Three base64url segments starting with a JOSE header. Specific enough not
    // to fire on arbitrary base64.
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
    note: 'JSON Web Token (Supabase anon / service_role key)',
  },
  { name: 'GITHUB_TOKEN', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, note: 'GitHub token' },
  { name: 'AWS_KEY', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, note: 'AWS access key id' },
  {
    name: 'PRIVATE_KEY',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
    note: 'private key',
  },
];

// Files that legitimately describe the SHAPE of a secret without being one.
const ALLOWLIST = [/^\.env\.example$/, /^scripts\/guard-secrets\.mjs$/];

let files;
try {
  files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  console.log('guard-secrets: not a git repository — skipping.');
  process.exit(0);
}

const hits = [];
for (const file of files) {
  if (ALLOWLIST.some((re) => re.test(file))) continue;

  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    continue;
  }
  if (buf.includes(0)) continue; // binary file — no control char needed to say so
  const text = buf.toString('utf8');

  text.split('\n').forEach((line, i) => {
    for (const p of PATTERNS) {
      if (p.re.test(line)) hits.push({ file, line: i + 1, rule: p.name, note: p.note });
    }
  });
}

if (hits.length > 0) {
  console.error(`\n✗ SECRET MATERIAL IN ${hits.length} TRACKED LOCATION(S):\n`);
  for (const h of hits) console.error(`  ${h.file}:${h.line}  [${h.rule}] — ${h.note}`);
  console.error(
    '\nCLAUDE.md §9: no secrets in the repo, ever. Remove it, gitignore the path,\n' +
      'and ROTATE the credential — assume anything committed is already compromised.\n',
  );
  process.exit(1);
}

console.log(`✓ no secrets in ${files.length} tracked files.`);
