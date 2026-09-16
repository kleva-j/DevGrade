import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const config = defineConfig({
  // Native tsconfig `paths` resolution (Vite 8+). `@/*` and `@workspace/ui/*`
  // resolve straight from tsconfig.json — one source of truth shared with the
  // editor (tsc) and the test runner (tsx). Supersedes the vite-tsconfig-paths
  // plugin, which Vite now warns is redundant.
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
});

export default config;
