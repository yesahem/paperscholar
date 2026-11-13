# `@repo/eslint-config`

Shared ESLint configurations.

| Export                               | For                                         |
| ------------------------------------ | ------------------------------------------- |
| `@repo/eslint-config/base`           | Framework-free TypeScript packages          |
| `@repo/eslint-config/bun`            | The backend and other code that runs on Bun |
| `@repo/eslint-config/next-js`        | The Next.js app                             |
| `@repo/eslint-config/react-internal` | Shared React component packages             |

TypeScript 7 has no JavaScript compiler API, so `typescript-eslint` cannot be used.
Babel parses TypeScript syntax and `tsc` enforces type-level rules such as unused
locals and undefined names.

The Next.js and React configs block imports of server-only packages, as required by
`docs/specs/02-monorepo.md` §5.
