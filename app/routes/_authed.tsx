import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

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

function GarageModeToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(document.documentElement.classList.contains("garage"));
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    document.documentElement.classList.toggle("garage", next);
    try {
      localStorage.setItem("garage-mode", next ? "1" : "0");
    } catch {
      // private browsing — theme just won't persist
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      title="Garage Mode: high contrast + big type for the shop"
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold tracking-wide transition-colors ${
        on
          ? "border-accent bg-accent text-accent-ink"
          : "border-line bg-card text-ink-muted hover:text-ink"
      }`}
    >
      <span aria-hidden>🔧</span>
      <span className="hidden sm:inline">GARAGE</span>
    </button>
  );
}

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            to="/vehicles"
            className="flex items-center gap-2 font-bold text-ink"
          >
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-lg text-accent-ink"
            >
              🏁
            </span>
            <span>Logbook</span>
          </Link>
          <div className="flex items-center gap-2">
            <GarageModeToggle />
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              >
                {user.avatarPath ? (
                  <img
                    src={`/files/${user.avatarPath}`}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sunken text-sm font-medium text-ink">
                    {(user.displayName ?? user.email)[0]?.toUpperCase()}
                  </span>
                )}
              </button>
              {menuOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 cursor-default"
                    onClick={() => setMenuOpen(false)}
                    aria-label="Close menu"
                    tabIndex={-1}
                  />
                  <div className="absolute right-0 z-10 mt-2 w-56 rounded-xl border border-line bg-card py-1 shadow-lg">
                    <div className="border-b border-line px-4 py-2">
                      <p className="truncate text-sm font-medium text-ink">
                        {user.displayName ?? user.email}
                      </p>
                      {user.displayName ? (
                        <p className="truncate text-xs text-ink-muted">
                          {user.email}
                        </p>
                      ) : null}
                    </div>
                    <Link
                      to="/profile"
                      className="block px-4 py-3 text-sm text-ink hover:bg-sunken"
                      onClick={() => setMenuOpen(false)}
                    >
                      Profile
                    </Link>
                    <a
                      href="/logout"
                      className="block px-4 py-3 text-sm text-ink hover:bg-sunken"
                    >
                      Log out
                    </a>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 pb-16 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
