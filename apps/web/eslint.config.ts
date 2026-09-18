import { tanstackConfig } from "@tanstack/eslint-config";

export default [
  ...tanstackConfig,
  {
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",
    },
  },
  {
    // Never lint build artifacts: Vite's client bundle (dist), the Nitro
    // server/public output (.output), and Nitro's intermediate cache.
    ignores: [
      "eslint.config.ts",
      ".prettierrc",
      "dist/**",
      ".output/**",
      ".nitro/**",
      "node_modules/**",
    ],
  },
];
