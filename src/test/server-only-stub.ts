// No-op stand-in for the `server-only` marker, used by vitest.config.ts.
//
// The real package throws on import so that a Client Component importing a
// server module fails the BUILD. That guard still applies to `next build`;
// this stub exists only so those server modules are testable at all.
export {};
