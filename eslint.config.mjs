import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const webFiles = ["apps/web/**/*.{js,jsx,ts,tsx}"];

export default defineConfig([
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals.map((config) => ({ ...config, files: webFiles })),
  ...nextTypeScript.map((config) => ({ ...config, files: webFiles })),
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/dist/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/playwright-report/**",
    "**/test-results/**",
    "**/next-env.d.ts",
  ]),
]);
