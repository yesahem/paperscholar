import { createRequire } from "node:module";
import babelParser from "@babel/eslint-parser";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import onlyWarn from "eslint-plugin-only-warn";

const require = createRequire(import.meta.url);

/**
 * Babel resolves presets relative to the linted package, where the preset is
 * not installed. Resolving it here pins it to this config package instead.
 */
const typescriptPreset = require.resolve("@babel/preset-typescript");
/** Babel 8's TypeScript preset no longer enables JSX for .tsx files on its own. */
const jsxSyntaxPlugin = require.resolve("@babel/plugin-syntax-jsx");

/**
 * Packages that hold secrets or server-only logic. Browser-facing packages must
 * reach them over HTTP through the backend (docs/specs/02-monorepo.md §5).
 */
export const serverOnlyPackages = [
  "@repo/db",
  "@repo/storage",
  "@repo/content",
  "@repo/runner",
  "@repo/pipeline",
];

/**
 * Builds a `no-restricted-imports` rule that blocks the given packages and
 * their subpaths.
 *
 * @param {string[]} packages
 * @param {string} message
 * @returns {import("eslint").Linter.RulesRecord}
 */
export function restrictImports(packages, message) {
  return {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: packages.flatMap((name) => [name, `${name}/*`]),
            message,
          },
        ],
      },
    ],
  };
}

/**
 * A shared ESLint configuration for the repository.
 *
 * TypeScript 7 has no JavaScript compiler API, so typescript-eslint cannot run
 * here. Babel parses the syntax and `tsc` owns type-level checks, including
 * unused locals and undefined names.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: [typescriptPreset],
          overrides: [{ test: /\.[jt]sx$/, plugins: [jsxSyntaxPlugin] }],
        },
      },
    },
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-implicit-coercion": "error",
      "no-param-reassign": ["error", { props: false }],
      "no-return-assign": "error",
      "no-throw-literal": "error",
      "prefer-const": "error",
      "object-shorthand": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      // Enforced by tsc (noUnusedLocals, noUnusedParameters, strict). These core
      // rules do not understand type-only references and misreport them.
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
    },
  },
  {
    plugins: {
      onlyWarn,
    },
  },
  {
    ignores: ["dist/**", "coverage/**", ".turbo/**"],
  },
];
