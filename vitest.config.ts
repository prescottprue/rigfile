import { loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // Pull DATABASE_URL, SESSION_SECRET, etc. from .env into process.env so app
  // code (which reads process.env directly) sees them inside tests.
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);

  return {
    plugins: [tsconfigPaths()],
    test: {
      globals: true,
      environment: "happy-dom",
      include: ["app/**/*.{test,spec}.{ts,tsx}"],
    },
  };
});
