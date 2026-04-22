import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { logoutFn } from "~/auth/server-fns";

export const Route = createFileRoute("/logout")({
  component: LogoutPage,
});

function LogoutPage() {
  const router = useRouter();
  useEffect(() => {
    logoutFn().catch(() => {
      // redirect is thrown; router.navigate happens via invalidate below
    });
    void router.invalidate();
  }, [router]);
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-slate-600">Signing out…</p>
    </main>
  );
}
