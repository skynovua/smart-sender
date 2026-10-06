# Smart Sender

Frontend test assignment with a configured development environment and a typed MSW API.
The mock implements authentication, session expiry/rotation/revocation, and webhook
listing/editing. The API client, authentication UI, webhook screens, and the required
concurrent-401 client test are the next implementation steps.

## Requirements and installation

- Node.js 24.14.1 (`.nvmrc`)
- pnpm 11.17.0 (`packageManager` in `package.json`)

```sh
nvm use
pnpm install --frozen-lockfile
pnpm dev
```

The application is available at the local URL printed by Vite. MSW is enabled by default
in development and production preview builds so the assignment can run without a backend.
The worker starts before React renders. All API data and session state live only in mock
memory; reloading the page resets the session and the 28 seeded webhooks.

An optional `.env` file can be copied from `.env.example`. Set `VITE_ENABLE_MSW=false`
only when connecting a real backend; Vite must be restarted after changing environment variables.

## Commands

| Command                | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `pnpm dev`             | Start Vite with hot reload and route generation       |
| `pnpm build`           | Generate routes, check TypeScript, and create `dist/` |
| `pnpm preview`         | Serve the production build locally                    |
| `pnpm routes:generate` | Regenerate the typed route tree                       |
| `pnpm typecheck`       | Generate routes and check both TypeScript projects    |
| `pnpm lint`            | Run ESLint with zero allowed warnings                 |
| `pnpm lint:fix`        | Apply available ESLint fixes                          |
| `pnpm format`          | Format files and sort imports and Tailwind classes    |
| `pnpm format:check`    | Check formatting without changing files               |
| `pnpm test`            | Run Vitest once                                       |
| `pnpm test:watch`      | Run Vitest in watch mode                              |
| `pnpm check`           | Check formatting, lint, types, and tests              |

Eight HTTP integration tests exercise the mock contract: the exact 30-second expiry boundary,
rotation and revocation, fingerprint binding, CSRF checks before side effects, captcha and
field validation, stable pagination/search, editing, and missing records/malformed requests.
The tests inject a clock into the mock instead of waiting for real time to pass.

Run only the mock contract suite with `pnpm test src/mocks/create-mock-api.test.ts`.
The assignment's required test of two concurrent 401 responses sharing a single client-side
rotate will be added with the API client; it is not covered by these server-side tests.

## Mock credentials and contract choices

- Email: `senior@example.com`
- Password: `SmartSender123!`
- Login requires a nonempty `X-Captcha-Token`; no captcha widget is needed.
- Every request requires `X-Requested-With: XMLHttpRequest`.
- First obtain the fixed CSRF token from the `X-CSRF-TOKEN` response header of `GET /csrf`.
  All POST and PUT requests require that token in the same request header.
- Login returns a device grant bound to a 32-character hexadecimal fingerprint. Issue
  consumes that grant once. Session state is private to the mock and is not returned to clients.
- Sessions expire at 30 seconds. An expired session can be rotated for another 30 seconds;
  an unissued or revoked session cannot. Revoke is idempotent for a valid fingerprint and
  does not affect a session belonging to a different fingerprint.

The assignment leaves a few edge cases open. This implementation makes these choices:

- IDs are numbers and `created_at` is an ISO timestamp string.
- List size is always 10, regardless of the supplied `limit` value. Invalid page numbers
  become 1; pages beyond the last page are clamped. An empty result has `current=last=1`.
- Search is trimmed and matches a name substring without regard to case. Updates trim
  the name and URL, accept only HTTP/HTTPS URLs, and preserve activity and creation date.
- Both GET and PUT for a missing webhook return 404 after authentication checks.
- Malformed JSON, missing `X-Requested-With`, or invalid rotate/revoke bodies return 400.
  Missing captcha returns 422 with a `captcha` field error. Incorrect credentials return
  a `password` field error. CSRF failures return 419 before any operation takes place.

## Tooling decisions

- React and TypeScript with `strict`, `noUncheckedIndexedAccess`, and
  `exactOptionalPropertyTypes` enabled.
- TanStack Router with file-based routes, generated types, and automatic code splitting.
  The assignment leaves the routing library open, so TanStack Router is permitted.
- TanStack Query for server state. Automatic query and mutation retries are disabled;
  the upcoming API client will own the bounded 401/419 recovery policy.
- React Hook Form, Zod, and the Zod resolver for upcoming forms and parameter validation.
- Tailwind CSS v4 through the official Vite plugin; no separate PostCSS configuration.
- MSW v2, which is compatible with Vitest's MSW peer dependency. Shared handlers are
  connected to both the browser worker and the Node test server.
- Vitest, jsdom, and Testing Library are configured for component tests. API tests can use
  `// @vitest-environment node` to avoid the DOM environment. Unexpected requests fail tests.
- ESLint checks TypeScript, React Hooks, and Fast Refresh exports. Prettier owns formatting.
- Prettier sorts imports while preserving side-effect import order, and sorts Tailwind classes.
- Exact dependency versions and a committed pnpm lockfile keep installations reproducible.

## Editor and commit automation

For VS Code, install the extensions recommended in `.vscode/extensions.json`.
Workspace settings enable Prettier on save, ESLint fixes on explicit save, and Tailwind
IntelliSense. Import sorting is handled by Prettier; the editor's competing import organizer
is disabled. Other editors can use the same project Prettier and EditorConfig files.

`pnpm install` activates Husky. Before each commit, lint-staged fixes and formats staged
source files and formats staged documents/configuration. It only operates on staged files;
run `pnpm check` for a full project check.

The generated route tree and MSW worker are committed but excluded from formatting and linting.
Do not edit `src/routeTree.gen.ts` or `public/mockServiceWorker.js` manually. Regenerate the
worker with `pnpm exec msw init public --save` after updating MSW.

## Source layout

```text
src/
  api/       Request/response types and the API error contract
  app/       Application providers, QueryClient, typed router
  mocks/     In-memory API, fixtures, response helpers, contract tests, MSW adapters
  routes/    File-based routes and root layout
  test/      Vitest setup and test utilities
```

`@/` resolves to `src/` in TypeScript, Vite, and Vitest.
