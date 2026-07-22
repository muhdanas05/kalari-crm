import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` is a guard for the Next bundler: importing it from a
      // Client Component is a build error, which is exactly what we want in the
      // app. Under vitest there is no client/server graph, and its default
      // export throws on import — so point it at a no-op.
      //
      // This does NOT weaken the guard: `next build` still resolves the real
      // package and still fails a client import. It only stops the marker from
      // making server modules untestable, and the alternative (not testing the
      // crypto) is far worse.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
});
