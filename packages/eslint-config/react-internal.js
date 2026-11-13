import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { config as baseConfig, restrictImports, serverOnlyPackages } from "./base.js";

/**
 * A custom ESLint configuration for libraries that use React.
 *
 * @type {import("eslint").Linter.Config[]} */
export const config = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
  pluginReactHooks.configs.flat.recommended,
  {
    rules: restrictImports(
      [...serverOnlyPackages, "next"],
      "Shared UI stays framework-agnostic and browser-safe (docs/specs/02-monorepo.md §5).",
    ),
  },
];
