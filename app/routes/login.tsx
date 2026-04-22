import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
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
  const router = useRouter();
  const { redirectTo } = Route.useSearch();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    try {
      const result = await loginFn({ data: { email, password, redirectTo } });
      if (result && "error" in result) {
        setError(result.error);
      } else {
        await router.invalidate();
      }
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
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
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
