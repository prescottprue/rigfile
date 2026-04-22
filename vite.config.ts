import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Dev and production Cloudflare builds go through @cloudflare/vite-plugin,
// which reuses the "ssr" Vite environment. The Nitro preset creates a separate
// "nitro" environment that the TanStack Start compiler does not transform, so
// server functions called from that env return undefined and every RPC 500s
// with "Cannot read properties of undefined (reading 'method')". Keep Nitro
// strictly for the Node self-host production build.
const useNitro = process.env.DEPLOY_TARGET === "node";

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    tsconfigPaths(),
    tanstackStart({
      srcDirectory: "app",
      router: {
        routesDirectory: "routes",
      },
    }),
    viteReact(),
    tailwindcss(),
    useNitro ? nitro() : cloudflare({ viteEnvironment: { name: "ssr" } }),
  ],
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          input: "./server.ts",
        },
      },
    },
  },
});
