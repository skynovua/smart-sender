import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/app';

import './index.css';

async function bootstrap() {
  if (import.meta.env.VITE_ENABLE_MSW !== 'false') {
    const { worker } = await import('@/mocks/browser');
    await worker.start({
      onUnhandledRequest(request, print) {
        const { pathname } = new URL(request.url);
        if (/^\/(auth(?:\/|$)|v1(?:\/|$)|csrf$)/.test(pathname)) {
          print.error();
        }
      },
    });
  }

  const root = document.getElementById('root');
  if (!root) throw new Error('Root element is missing.');

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap().catch((error: unknown) => {
  console.error('Application startup failed:', error);
  const root = document.getElementById('root');
  if (root)
    root.textContent = 'Не вдалося запустити застосунок. Спробуйте перезавантажити сторінку.';
});
