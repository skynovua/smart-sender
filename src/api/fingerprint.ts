const STORAGE_KEY = 'smart-sender:fingerprint';

export function getDeviceFingerprint(
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): string {
  const stored = storage.getItem(STORAGE_KEY);
  if (stored && /^[\da-f]{32}$/i.test(stored)) return stored;

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const fingerprint = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  storage.setItem(STORAGE_KEY, fingerprint);
  return fingerprint;
}
