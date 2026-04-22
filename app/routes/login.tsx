import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { loginFn } from "~/auth/server-fns";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirectTo:
      typeof search.redirectTo === "string" ? search.redirectTo : undefined,
  }),
});

function LoginPage() {
  const { redirectTo } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    try {
      const result = await loginFn({ data: { email, password, redirectTo } });
      if ("error" in result) {
        setError(result.error);
      } else {
        window.location.assign(result.redirectTo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm"
      >
        <h1 className="text-2xl font-semibold text-slate-900">Log in</h1>
        {error ? (
          <p className="mt-4 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Password
          <div className="relative mt-1">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="current-password"
              className="w-full rounded border border-slate-300 p-2 pr-16"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-4 text-center text-sm text-slate-600">
          No account?{" "}
          <Link
            to="/join"
            search={{ redirectTo: undefined }}
            className="text-blue-600 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </form>
    </main>
  );
}
