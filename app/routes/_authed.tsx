import { createFileRoute, Outlet } from "@tanstack/react-router";

// Authentication enforcement lives inside each server function. Unauthenticated
// users see empty lists and get redirected to /login when they attempt a
// mutation. A future pass can tighten this up with a beforeLoad session read,
// once the TanStack Start + useSession integration is ironed out.
export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="/vehicles" className="font-semibold text-slate-900">
            Vehicle Work Log
          </a>
          <a href="/logout" className="text-sm text-blue-600 hover:underline">
            Log out
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
