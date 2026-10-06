# Smart Sender

Frontend test assignment built with React and TypeScript. The API is mocked with MSW; no backend is required.

## Run

Requires Node.js 24.14.1 and pnpm 11.17.0.

```sh
nvm use
pnpm install --frozen-lockfile
pnpm dev
```

MSW is enabled by default. Reloading resets mock data and the session, so sign in again; list page/search parameters remain in the URL.

## Tests

```sh
pnpm test
```

To run only the required concurrent `401` scenario:

```sh
pnpm test src/api/client.test.ts -t 'two parallel 401s'
```

The integration tests cover the mock API contract, API client, authentication UI, webhook list navigation, and editing. They include two concurrent `401` responses sharing one token rotation and then retrying successfully.

## Test credentials

- Email: `senior@example.com`
- Password: `SmartSender123!`

## Key decisions

- TypeScript strict mode, TanStack Router for routing, and TanStack Query for server state. Automatic query retries are disabled because the API client handles authentication retries.
- MSW keeps the session private in memory to simulate an HttpOnly cookie. The session expires after 30 seconds. Only the device fingerprint is stored in localStorage; the device session token stays in memory.
- Concurrent authentication failures share one rotation request. Each protected request retries once; a failed rotation or repeated `401` ends the local session.
- CSRF requests are shared between concurrent callers. A `419` refreshes the CSRF token and retries once.
- Webhook search is applied with Enter or the search button and resets pagination to page 1. Page/search parameters are stored in the URL; obsolete requests are cancelled.
- Editing uses React Hook Form and Zod; server validation errors map to fields. Successful saves update the detail cache and invalidate list queries.
