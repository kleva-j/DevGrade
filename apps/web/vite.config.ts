import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { devtools } from "@tanstack/devtools-vite";
import { defineConfig, loadEnv } from "vite";
import { nitro } from "nitro/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const config = defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    resolve: { tsconfigPaths: true },
    build: {
      rollupOptions: {
        output: {
          assetFileNames: (info) => {
            const name = info.names[0] ?? "";
            if (name.endsWith(".css")) return "assets/[name][extname]";
            return "assets/[name]-[hash][extname]";
          },
        },
      },
    },
    plugins: [devtools(), tailwindcss(), tanstackStart(), nitro(), viteReact()],
  };
});

export default config;
