# Smart Sender

Frontend test assignment built with React and TypeScript. The API is mocked with MSW; no backend is required.

## Run

Requires Node.js 24.14.1 and pnpm 11.17.0.

```sh
nvm use
pnpm install --frozen-lockfile
pnpm dev
```

MSW is enabled by default. Mock data resets on page reload.

## Tests

```sh
pnpm test
```

The integration tests cover the mock API contract, API client, authentication UI, and webhook list navigation. They include two concurrent `401` responses sharing one token rotation and then retrying successfully.

## Test credentials

- Email: `senior@example.com`
- Password: `SmartSender123!`

## Key decisions

- TypeScript strict mode, TanStack Router for routing, and TanStack Query for server state. Automatic query retries are disabled because the API client handles authentication retries.
- MSW keeps the session private in memory to simulate an HttpOnly cookie. The session expires after 30 seconds. Only the device fingerprint is stored in localStorage; the device session token stays in memory.
- Concurrent authentication failures share one rotation request. Each protected request retries once; a failed rotation or repeated `401` ends the local session.
- CSRF requests are shared between concurrent callers. A `419` refreshes the CSRF token and retries once.
- Webhook search is applied with Enter or the search button and resets pagination to page 1. Page/search parameters are stored in the URL; obsolete requests are cancelled.

## Unfinished

The mock API, API client, authentication, protected routes, and webhook list are implemented and tested. The following UI work remains:

- Webhook editing and field validation messages.
