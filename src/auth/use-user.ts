import { useSyncExternalStore } from 'react';

import type { AuthSession } from './session';

export function useUser(auth: AuthSession) {
  return useSyncExternalStore(auth.subscribe, auth.getUser, auth.getUser);
}
