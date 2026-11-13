# Contributing

Thanks for helping. This project is built in milestones described in
[`docs/specs/12-milestones.md`](docs/specs/12-milestones.md).

## Before you start

- Read [AGENTS.md](AGENTS.md): the rules for code quality, naming, file layout and the shared
  component kit. Pull requests that bypass `@repo/ui` with hand-styled buttons or inputs, or
  that leave placeholders in shipped code, will be asked to change.
- For anything larger than a small fix, open an issue first so the approach can be agreed.

## Set up

Follow "Run it locally" in the [README](README.md).

## Making a change

1. Branch from `main`: `feat/<short-description>` or `fix/<short-description>`.
2. Keep the change focused. Update the relevant spec in `docs/specs/` if behaviour changes.
3. Add or update tests in the package's `test/` folder.
4. Run every check before pushing:

   ```sh
   bun run format && bun run lint && bun run check-types && bun run test && bun run build
   ```

5. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   `feat(web): add paper catalogue filters`, `fix(backend): reject empty code`.
6. Open a pull request describing what changed and how you verified it.

## Contributing papers

Paper content arrives with milestone M1. The file format and the review process are described
in [`docs/specs/03-content.md`](docs/specs/03-content.md).

## Reporting security issues

Do not open a public issue. See [SECURITY.md](SECURITY.md).
