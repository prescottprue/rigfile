import {
  createFileRoute,
  getRouteApi,
  Link,
  useNavigate,
  useParams,
} from "@tanstack/react-router";

import { formatDateOnly } from "~/components/format";
import { btnPrimary, btnSecondary, card, chip } from "~/components/ui";

const logsApi = getRouteApi("/_authed/vehicles/$vehicleId/logs");

type LogsSearch = { vendor?: string };

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/logs/")({
  validateSearch: (search: Record<string, unknown>): LogsSearch => ({
    vendor: typeof search.vendor === "string" ? search.vendor : undefined,
  }),
  component: LogsList,
});

function LogsList() {
  const navigate = useNavigate();
  const { vehicleId } = useParams({
    from: "/_authed/vehicles/$vehicleId/logs/",
  });
  const { vendor } = Route.useSearch();
  const allLogs = logsApi.useLoaderData();

  // Vendors come straight from the loaded list — no extra query, and the
  // chips only ever show shops present in this vehicle's history.
  const vendors = Array.from(
    new Set(
      allLogs
        .map((l) => l.mechanicName)
        .filter((name): name is string => name != null),
    ),
  );
  const logs = vendor
    ? allLogs.filter((l) => l.mechanicName === vendor)
    : allLogs;

  function setVendor(next: string | undefined) {
    navigate({
      to: "/vehicles/$vehicleId/logs",
      params: { vehicleId },
      search: next ? { vendor: next } : {},
      replace: true,
    });
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-ink">Work history</h2>
        <div className="flex gap-2">
          <Link
            to="/vehicles/$vehicleId/scan"
            params={{ vehicleId }}
            className={btnSecondary}
          >
            📷 Scan
          </Link>
          <Link
            to="/vehicles/$vehicleId/logs/new"
            params={{ vehicleId }}
            className={btnPrimary}
          >
            + Log work
          </Link>
        </div>
      </div>

      {vendors.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={chip(!vendor)}
            onClick={() => setVendor(undefined)}
          >
            All
          </button>
          {vendors.map((name) => (
            <button
              key={name}
              type="button"
              className={chip(vendor === name)}
              onClick={() => setVendor(vendor === name ? undefined : name)}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}

      {logs.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">
          {vendor
            ? `No logs from ${vendor} yet.`
            : "Nothing logged yet — hit “Log work” after the next job."}
        </p>
      ) : (
        <ul className={`${card} mt-6 divide-y divide-line`}>
          {logs.map((log) => (
            <li key={log.id}>
              <Link
                to="/vehicles/$vehicleId/logs/$logId"
                params={{ vehicleId, logId: log.id }}
                className="block p-4 hover:bg-sunken"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-ink">{log.title}</span>
                  {log.cost != null ? (
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-muted">
                      $
                      {log.cost.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-ink-muted">
                  {formatDateOnly(log.servicedAt)}
                  {log.type ? ` · ${log.type}` : ""}
                  {log.odometer != null
                    ? ` · ${Math.round(log.odometer).toLocaleString()} mi`
                    : ""}
                  {log.mechanicName ? ` · ${log.mechanicName}` : ""}
                  {log.authorName ? ` · ${log.authorName}` : ""}
                  {log.selfService ? " · DIY" : ""}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
