export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return '/';

  const destination = new URL(value, 'https://app.local');
  return destination.pathname.replace(/\/+$/, '') === '/login' ? '/' : value;
}
