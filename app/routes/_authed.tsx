import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getCurrentUserFn } from "~/auth/server-fns";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }) => {
    const user = await getCurrentUserFn();
    if (!user) {
      throw redirect({
        to: "/login",
        search: { redirectTo: location.href },
      });
    }
    return { user };
  },
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
