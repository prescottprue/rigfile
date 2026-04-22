import {
  createFileRoute,
  getRouteApi,
  Link,
  useParams,
} from "@tanstack/react-router";

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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Service logs</h2>
        <Link
          to="/vehicles/$vehicleId/logs/new"
          params={{ vehicleId }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          Add log
        </Link>
      </div>
      {logs.length === 0 ? (
        <p className="mt-6 text-slate-600">No logs yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {logs.map((log) => (
            <li key={log.id} className="p-4">
              <Link
                to="/vehicles/$vehicleId/logs/$logId"
                params={{ vehicleId, logId: log.id }}
                className="block"
              >
                <div className="font-medium text-slate-900">{log.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {log.servicedAt.toLocaleDateString()}
                  {log.type ? ` · ${log.type}` : ""}
                  {log.odometer != null
                    ? ` · ${log.odometer.toLocaleString()} mi`
                    : ""}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
