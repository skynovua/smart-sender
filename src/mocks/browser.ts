import { setupWorker } from 'msw/browser';

import { createMockApi } from './create-mock-api';

const mockApi = createMockApi({ listDelayMs: 350 });

export const worker = setupWorker(...mockApi.handlers);
