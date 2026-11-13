import globals from "globals";
import { config as baseConfig } from "./base.js";

/**
 * ESLint configuration for code that runs on the Bun runtime: the backend app
 * and server-side packages.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const bunConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        Bun: "readonly",
      },
    },
  },
];
