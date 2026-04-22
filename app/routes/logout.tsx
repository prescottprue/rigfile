import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { logoutFn } from "~/auth/server-fns";

export const Route = createFileRoute("/logout")({
  component: LogoutPage,
});

function LogoutPage() {
  useEffect(() => {
    logoutFn()
      .then((result) => {
        window.location.assign(result.redirectTo);
      })
      .catch(() => {
        window.location.assign("/");
      });
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-slate-600">Signing out…</p>
    </main>
  );
}
