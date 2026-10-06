import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/')({ component: HomePage });

function HomePage() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-3xl font-semibold tracking-tight">Smart Sender</h1>
      <p className="mt-3 text-slate-600">Керування вебхуками.</p>
    </section>
  );
}
