import { bunConfig } from "@repo/eslint-config/bun";

/** @type {import("eslint").Linter.Config[]} */
export default [...bunConfig, { ignores: [".venv/**"] }];
