# Contributing

Thanks for taking an interest in Kesh. It is an early personal project, so small, focused pull requests and clear bug reports are the most useful contributions. For anything large, open an issue first.

## Repository layout

| Path | What it is |
|---|---|
| `apps/ios` | The iOS app (React Native 0.88, TypeScript, a little Swift for the on-device model). Its own `package.json`; not part of the npm workspaces. |
| `packages/companion` | The Mac companion CLI (Node 22, TypeScript, esbuild, Babel, ws, zod). |
| `packages/protocol` | Wire protocol types shared by the companion and the app (`src/index.ts`). |
| `packages/sdk` | `@kesh/sdk` type declarations (`src/index.d.ts`) and the workspace `template/` copied to `~/.kesh/workspace`. |
| `examples/plugins` | Example plugins. |
| `docs` | Documentation, diagrams (`docs/assets`) and media (`docs/media`). |

The app imports the protocol from `packages/protocol` (`apps/ios/src/protocol.ts` is a re-export), so protocol changes affect both sides at once.

## Setup

```bash
npm install                    # repo root: companion, protocol, sdk
cd apps/ios && npm install     # the app
```

See [docs/getting-started.md](docs/getting-started.md) for building and running the app.

## Running tests

| Where | Command | Runner |
|---|---|---|
| Repo root | `npm test` | Runs `npm test` in every workspace package that has one (today: the companion) |
| `packages/companion` | `npm test` | vitest |
| `packages/companion` | `npm run typecheck` (or `npx tsc --noEmit`) | TypeScript |
| `packages/sdk` | `npm run check` | Validates template manifests and icons against the protocol, syncs SDK types into the template, type-checks the template |
| `apps/ios` | `npm test` | jest |
| `apps/ios` | `npm run lint` | ESLint (`@react-native` config) |

Please run the companion tests and `packages/sdk` check, and the app's tests if you touch the app, before opening a pull request. There is no CI yet.

## Conventions seen in the repo

- TypeScript everywhere; strict mode. Prefer small modules with a header comment on non-obvious ones.
- The companion uses ESM, single quotes, two-space indent, semicolons and trailing commas. The app follows its Prettier config (`.prettierrc.js`: single quotes, trailing commas, arrow parens avoided).
- Validate every message at the boundary (zod on the companion). Never trust data from the phone or from plugin files.
- Anything that touches security (pairing, icon sanitizer, Claude runner flags, the plugin host) needs a test, and must not weaken the properties in [docs/security.md](docs/security.md). Update that document when behavior changes.
- Keep the docs true: if something is not implemented, say so plainly. Do not describe planned features as present.
- Plugins follow the design language in [docs/plugin-authoring.md](docs/plugin-authoring.md): only the `theme` tokens, no italics, no shadows.
- No personal data in commits: no pairing URLs or tokens, device identifiers, Apple team ids, machine names or absolute home-directory paths.

## Pull requests

- One topic per pull request, with a short description of what and why.
- Include tests for behavior changes, and update the relevant document in `docs/`.
- Be kind in review.

Security problems: do not open a public issue; see [SECURITY.md](SECURITY.md).

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
