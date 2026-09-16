import { defineConfig, loadEnv } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const config = defineConfig(({ mode }) => {
  // Server functions run inside the Vite process in dev, and neither Vite nor
  // the TanStack Start dev server loads `.env` into `process.env` (only srvx's
  // production CLI does). Load every var (empty prefix) so server-only secrets
  // like DATABASE_URL reach `getDb()`. This never reaches the client bundle,
  // which stays limited to the `VITE_` prefix via `import.meta.env`.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    // Native tsconfig `paths` resolution (Vite 8+). `@/*` and `@workspace/ui/*`
    // resolve straight from tsconfig.json — one source of truth shared with the
    // editor (tsc) and the test runner (tsx). Supersedes the vite-tsconfig-paths
    // plugin, which Vite now warns is redundant.
    resolve: { tsconfigPaths: true },
    plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  };
});

export default config;
