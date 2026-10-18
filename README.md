# Drifter

A simple one-thumb car drifting game for mobile browsers. Hold a side to steer, chain drifts for score before the timer runs out. Drive the circuit, or free drift on an open lot with nothing to follow.

See [docs/PLAN.md](docs/PLAN.md) for the design and build plan.

## Development

Requires Node 22+.

```sh
npm install
npm run dev        # dev server, reachable from a phone on the same network
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve the production bundle
```

Before committing:

```sh
npm run lint
npm run typecheck
npm test
npm run format:check
```

## Stack

TypeScript, Vite, Canvas 2D, no framework. ESLint and Prettier for hygiene, Vitest for unit tests.
