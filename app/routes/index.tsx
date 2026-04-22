import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">
          Vehicle Work Log
        </h1>
        <p className="mt-2 text-slate-600">
          Rebuilt on TanStack Start. Core features coming back online shortly.
        </p>
      </div>
    </main>
  );
}
