import { createFileRoute, Link } from "@tanstack/react-router";

import { btnPrimary, btnSecondary, card } from "~/components/ui";

export const Route = createFileRoute("/")({
  component: Home,
});

const REPO_URL = "https://github.com/prescottprue/rigfile";

function Home() {
  return (
    <main className="min-h-screen bg-surface px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="text-center">
          <p className="text-4xl">🔧</p>
          <h1 className="mt-2 text-4xl font-semibold text-ink">RigFile</h1>
          <p className="mx-auto mt-3 max-w-xl text-lg text-ink-muted">
            A shared maintenance log for your garage. Track service history,
            reminders, and build projects for every vehicle — together with your
            crew.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/join"
              search={{ redirectTo: undefined }}
              className={btnPrimary}
            >
              Sign up
            </Link>
            <Link
              to="/login"
              search={{ redirectTo: undefined }}
              className={btnSecondary}
            >
              Log in
            </Link>
            <Link to="/vehicles" className={btnSecondary}>
              Your vehicles
            </Link>
          </div>
        </header>

        <section className="mt-12 grid gap-4 sm:grid-cols-2">
          <div className={`${card} p-6`}>
            <h2 className="text-lg font-semibold text-ink">
              📷 Scan paper receipts — privately
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Snap a shop invoice and RigFile reads the date, mileage, cost, and
              work performed into a log entry, with the original photo attached.
              Extraction runs on self-hosted AI models — your records are never
              sent to third-party AI services.
            </p>
          </div>

          <div className={`${card} p-6`}>
            <h2 className="text-lg font-semibold text-ink">
              🤖 Talk to your garage from Claude
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              RigFile is an MCP server: connect it to your own Claude account
              and ask "what's due on the Jeep?" or "log the oil change I just
              did" — from your phone, mid-wrench. You sign in with your RigFile
              account; Claude only sees what you can see.
            </p>
          </div>

          <div className={`${card} p-6`}>
            <h2 className="text-lg font-semibold text-ink">
              🛠️ Built for a crew
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Invite people to a vehicle and everyone logs work, completes
              reminders, and tracks project parts in one place. Service
              reminders come due by date or mileage — whichever hits first.
            </p>
          </div>

          <div className={`${card} p-6`}>
            <h2 className="text-lg font-semibold text-ink">
              🔓 Your data is yours
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Export your complete history as JSON at any time. RigFile is open
              source, so you can always run your own instance — on Cloudflare or
              a single self-hosted container — and take your data with you.
            </p>
          </div>
        </section>

        <footer className="mt-10 text-center text-sm text-ink-muted">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent hover:underline"
          >
            Open source on GitHub
          </a>{" "}
          — MIT licensed. Self-host it, fork it, make it yours.
        </footer>
      </div>
    </main>
  );
}
