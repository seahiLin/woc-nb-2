# sprig-app

A TanStack Start app that runs as a Cloudflare Worker (`@cloudflare/vite-plugin`).

- Routes are files in `src/routes/` (TanStack Router file-based routing). `src/routeTree.gen.ts` is generated at build time; do not edit it by hand.
- Styling is Tailwind CSS v4 (`src/styles.css`).
- `src/server.ts` wraps the TanStack Start handler and sets the CSP `frame-ancestors` header so Sprig Studio can embed previews. Keep it.
- Dependencies are managed with npm. If you add one, also add it to `package.json`.
