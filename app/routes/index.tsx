import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">Logbook</h1>
        <p className="mt-2 text-slate-600">
          Keep a maintenance record for every car you own.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            to="/join"
            search={{ redirectTo: undefined }}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Sign up
          </Link>
          <Link
            to="/login"
            search={{ redirectTo: undefined }}
            className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
          >
            Log in
          </Link>
          <Link
            to="/vehicles"
            className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
          >
            Your vehicles
          </Link>
        </div>
      </div>
    </main>
  );
}
