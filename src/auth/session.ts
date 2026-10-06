import type { QueryClient } from '@tanstack/react-query';

import { ApiClient } from '@/api/client';
import type { LoginRequest, User } from '@/api/contracts';
import { SessionChangedError } from '@/api/errors';

export class AuthSession {
  readonly api: ApiClient;
  private user: User | null = null;
  private generation = 0;
  private readonly queryClient: QueryClient;
  private readonly listeners = new Set<() => void>();

  constructor(queryClient: QueryClient) {
    this.queryClient = queryClient;
    this.api = new ApiClient({
      onSessionEnd: () => {
        this.generation++;
        this.queryClient.clear();
        this.setUser(null);
      },
    });
  }

  getUser = () => this.user;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async signIn(credentials: Pick<LoginRequest, 'email' | 'password'>) {
    const generation = this.generation;
    const user = await this.api.signIn(credentials);
    if (generation !== this.generation) throw new SessionChangedError();
    this.queryClient.clear();
    this.setUser(user);
    return user;
  }

  signOut() {
    return this.api.signOut();
  }

  private setUser(user: User | null) {
    if (this.user === user) return;
    this.user = user;
    this.listeners.forEach((listener) => listener());
  }
}
