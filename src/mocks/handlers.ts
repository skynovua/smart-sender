import type { RequestHandler } from 'msw';

// Shared by browser and test environments. API handlers are the next implementation step.
export const handlers: RequestHandler[] = [];
