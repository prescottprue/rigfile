import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const isCloudflare = process.env.DEPLOY_TARGET === "cloudflare";

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
    isCloudflare ? cloudflare({ viteEnvironment: { name: "ssr" } }) : nitro(),
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
