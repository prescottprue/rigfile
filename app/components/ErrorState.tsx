import { Link } from "@tanstack/react-router";

import { btnPrimary, btnSecondary } from "~/components/ui";

/** A broken-down little car — flat tire, sad face — for error/not-found pages. */
function SadCar({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 46"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* body */}
      <path
        d="M8 34 L8 25 L18 25 L24 18 L38 18 L44 25 L56 25 L56 34 Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* window */}
      <path
        d="M20 24 L24 19.5 L32 19.5 L32 24 Z"
        fill="currentColor"
        fillOpacity="0.2"
      />
      {/* sad face */}
      <circle cx="25" cy="29" r="1" fill="currentColor" />
      <circle cx="31" cy="29" r="1" fill="currentColor" />
      <path
        d="M24 32.5 Q28 30 32 32.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* wheels — the front one is flat */}
      <circle cx="18" cy="35" r="4" stroke="currentColor" strokeWidth="2.5" />
      <ellipse
        cx="46"
        cy="36.3"
        rx="4"
        ry="2.3"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    </svg>
  );
}

export function ErrorState({
  title,
  message,
  onReset,
}: {
  title: string;
  message: string;
  onReset?: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-6 py-16">
      <div className="max-w-md text-center">
        <SadCar className="mx-auto h-24 w-auto text-ink-muted" />
        <h1 className="mt-6 text-2xl font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-ink-muted">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {onReset ? (
            <button type="button" onClick={onReset} className={btnPrimary}>
              Try again
            </button>
          ) : null}
          <Link to="/" className={onReset ? btnSecondary : btnPrimary}>
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
