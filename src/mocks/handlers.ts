import { createMockApi } from './create-mock-api';

const mockApi = createMockApi();

export const handlers = mockApi.handlers;
export const resetMockApi = mockApi.reset;
