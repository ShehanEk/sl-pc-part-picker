import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The desktop app's build output — a 3MB generated bundle of the pipeline.
    // Its source is linted; the bundle is not source.
    "desktop/dist/**",
    "desktop/renderer/dist/**",
    "desktop/node_modules/**",
  ]),
]);

export default eslintConfig;
