import type { User, Webhook } from '@/api/contracts';

export const mockCredentials = {
  email: 'senior@example.com',
  password: 'SmartSender123!',
};

export const mockUser: User = {
  id: 1,
  email: mockCredentials.email,
  first_name: 'Demo',
  last_name: 'User',
  name: 'Demo User',
};

export function createWebhooks(): Webhook[] {
  return Array.from({ length: 28 }, (_, index) => {
    const id = index + 1;
    const category = id <= 10 ? 'Payment' : id <= 19 ? 'Subscription' : 'Customer';

    return {
      id,
      name: `${category} webhook ${String(id).padStart(2, '0')}`,
      url: `https://example.com/webhooks/${id}`,
      active: id % 3 !== 0,
      created_at: '2026-01-01T00:00:00.000Z',
    };
  });
}
