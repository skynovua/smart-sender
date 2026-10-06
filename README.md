# Smart Sender

Frontend test assignment with a typed MSW API and a tested HTTP client. The mock implements
authentication, session expiry/rotation/revocation, and webhook listing/editing. The client
handles CSRF and bounded session recovery, including the required concurrent-401 test.
Authentication UI and webhook screens are the next implementation steps.

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

The test suite contains eight mock contract tests and sixteen client integration tests.
Tests inject a clock into the mock and control response ordering with Promises; they never
wait for real time to pass.

- Mock contract: `pnpm test src/mocks/create-mock-api.test.ts` checks expiry, rotation,
  revocation, fingerprint binding, CSRF checks before side effects, captcha, validation,
  pagination/search, editing, and malformed/missing requests.
- Client: `pnpm test src/api/client.test.ts` includes the required test of two parallel
  real mock 401 responses, exactly one rotate, and two successful retries. It also checks
  delayed 401 responses, failed recovery, bounded 419 retries, cancellation, and auth races.

## API client

Use one `ApiClient` instance for the application so all requests share recovery operations.
Its typed methods are `signIn`, `signOut`, `getMe`, `getWebhooks`, `getWebhook`, and
`updateWebhook`. Query methods accept an optional `AbortSignal` from TanStack Query.

- `signIn` obtains CSRF, sends login with captcha/fingerprint, exchanges the device token,
  and returns `/v1/me`. The device token exists only in the sign-in call's local scope.
- Fingerprints use 16 random bytes represented as 32 hex characters. They are created once
  in `localStorage`; an invalid stored identifier is replaced. No auth tokens are persisted.
- Every request sends `X-Requested-With` and `credentials: include`. POST/PUT add the current
  CSRF token, and initial concurrent calls wait for one shared CSRF request.
- Protected `/v1/*` calls recover from 401 through one shared rotate and retry once. A
  rotation generation counter prevents a delayed old 401 from starting a second rotate.
  Auth endpoints themselves never trigger automatic session rotation.
- POST/PUT calls recover from 419 through one shared CSRF refresh and retry once. CSRF and
  auth retry limits are independent, and JSON bodies are serialized once for safe replay.
- Failed rotation or a repeated protected 401 invalidates the local session and calls
  `onSessionEnd` once. The upcoming auth provider will connect this callback to clearing
  user state/query caches and showing login. UI cleanup is not wired yet.
- Logout invalidates locally before revoke, even if revoke fails. New sign-in waits for a
  pending revoke. Session epochs reject stale responses from earlier login/logout cycles;
  cancelled consumers do not cancel recovery shared by other requests.
- Empty 200/204 bodies are supported. `ApiError` exposes status, server exception type,
  and field errors; malformed error responses fall back to a status-based message.

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
  the API client owns the bounded 401/419 recovery policy.
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
  api/       HTTP client, fingerprint, error parsing, DTOs, client integration tests
  app/       Application providers, QueryClient, typed router
  mocks/     In-memory API, fixtures, response helpers, contract tests, MSW adapters
  routes/    File-based routes and root layout
  test/      Vitest setup and test utilities
```

`@/` resolves to `src/` in TypeScript, Vite, and Vitest.
