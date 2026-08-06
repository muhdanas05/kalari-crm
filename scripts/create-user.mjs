#!/usr/bin/env node
/**
 * Create a CRM login. No self-signup — there is no register route, by design.
 *
 * The in-app Settings → Users page (admin-only) is the normal way to do this
 * now; this script is for the one case that needs: bootstrapping the very
 * first admin, before any session exists to click that button with.
 *
 *   node scripts/create-user.mjs <email> <password> <name> [admin|employee]
 *
 * Role defaults to admin. This is one of the few legitimate uses of the
 * service_role key (see the discipline rule in lib/supabase/server.ts):
 * creating an auth user genuinely has no acting human session to attribute
 * it to.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function parseEnv(path) {
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = v;
  }
  return out;
}

const [email, password, name, roleArg] = process.argv.slice(2);
if (!email || !password || !name) {
  console.error('usage: node scripts/create-user.mjs <email> <password> <name> [admin|employee]');
  process.exit(1);
}
const role = roleArg === 'employee' ? 'employee' : 'admin';

const env = parseEnv(new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // no inbox round-trip: the admin is standing right there
});

if (error) {
  console.error('auth.admin.createUser failed:', error.message);
  process.exit(1);
}

// profiles.id FKs to auth.users(id) — the profile must exist for is_admin() and
// every RLS policy to resolve. An auth user without a profile can log in and
// then see nothing, which is a confusing failure; create both or neither.
const { error: profileError } = await supabase
  .from('profiles')
  .upsert({ id: data.user.id, name, email, role, active: true }, { onConflict: 'id' });

if (profileError) {
  console.error('profile insert failed:', profileError.message);
  console.error('Rolling back the auth user so we do not leave a half-created account.');
  await supabase.auth.admin.deleteUser(data.user.id);
  process.exit(1);
}

console.log(`✓ created: ${name} <${email}> (${role})`);
console.log(`  id: ${data.user.id}`);
