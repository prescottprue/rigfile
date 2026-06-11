import {
  createFileRoute,
  getRouteApi,
  Link,
  useParams,
} from "@tanstack/react-router";

import { btnPrimary, card } from "~/components/ui";

const logsApi = getRouteApi("/_authed/vehicles/$vehicleId/logs");

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/logs/")({
  component: LogsList,
});

function LogsList() {
  const { vehicleId } = useParams({
    from: "/_authed/vehicles/$vehicleId/logs/",
  });
  const logs = logsApi.useLoaderData();
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-ink">Work history</h2>
        <Link
          to="/vehicles/$vehicleId/logs/new"
          params={{ vehicleId }}
          className={btnPrimary}
        >
          + Log work
        </Link>
      </div>
      {logs.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">
          Nothing logged yet — hit “Log work” after the next job.
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
                  {log.servicedAt.toLocaleDateString()}
                  {log.type ? ` · ${log.type}` : ""}
                  {log.odometer != null
                    ? ` · ${Math.round(log.odometer).toLocaleString()} mi`
                    : ""}
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
