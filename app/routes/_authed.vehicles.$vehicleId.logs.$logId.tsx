import { createId } from "@paralleldrive/cuid2";
import {
  createFileRoute,
  notFound,
  useNavigate,
  useParams,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { requireAuth } from "~/auth/session.server";
import { deleteLog, getLog } from "~/models/log.server";
import type { LogFile } from "~/models/log-file.server";
import {
  createLogFile,
  deleteLogFile,
  getLogFiles,
  getLogFilesByLogId,
} from "~/models/log-file.server";
import { getStorage } from "~/storage.server";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
]);

function categoryFromMime(mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "document";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

const loadLogFn = createServerFn({ method: "GET" })
  .inputValidator((input: { vehicleId: string; logId: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const [log, files] = await Promise.all([
      getLog({ id: data.logId, userId, vehicleId: data.vehicleId }),
      getLogFiles({
        logId: data.logId,
        userId,
        vehicleId: data.vehicleId,
      }),
    ]);
    if (!log) return null;
    return { log, files };
  });

const deleteLogFn = createServerFn({ method: "POST" })
  .inputValidator((input: { vehicleId: string; logId: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const files = await getLogFilesByLogId({
      logId: data.logId,
      userId,
    });
    await deleteLog({ id: data.logId, userId, vehicleId: data.vehicleId });
    const storage = getStorage();
    await Promise.all(files.map((f) => storage.delete(f.filePath)));
    return { vehicleId: data.vehicleId };
  });

const uploadLogFilesFn = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const logId = String(data.get("logId") ?? "");
    const vehicleId = String(data.get("vehicleId") ?? "");

    if (!logId || !vehicleId) {
      return { error: "Missing log or vehicle ID" as const };
    }

    const log = await getLog({ id: logId, userId, vehicleId });
    if (!log) return { error: "Log not found" as const };

    const files = data.getAll("files");
    const descriptions = data.getAll("descriptions");
    const storage = getStorage();
    const created: Array<{ id: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!(file instanceof File) || file.size === 0) continue;

      if (file.size > MAX_FILE_BYTES) {
        return {
          error: `"${file.name}" exceeds the 10 MB limit` as const,
        };
      }
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return {
          error: `"${file.name}" has an unsupported file type` as const,
        };
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const key = `log-files/${userId}/${logId}/${createId()}`;
      await storage.upload(key, bytes, file.type);

      const rawDesc = descriptions[i];
      const desc = typeof rawDesc === "string" ? rawDesc.trim() || null : null;

      const record = await createLogFile({
        logId,
        userId,
        filePath: key,
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
        category: categoryFromMime(file.type),
        description: desc,
      });
      created.push({ id: record.id });
    }

    return { created };
  });

const deleteLogFileFn = createServerFn({ method: "POST" })
  .inputValidator((input: { fileId: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const deleted = await deleteLogFile({ id: data.fileId, userId });
    if (deleted) {
      await getStorage().delete(deleted.filePath);
    }
    return { ok: true };
  });

export const Route = createFileRoute(
  "/_authed/vehicles/$vehicleId/logs/$logId",
)({
  component: LogDetail,
  loader: async ({ params }) => {
    const result = (await loadLogFn({ data: params })) ?? null;
    if (!result) throw notFound();
    return result;
  },
});

function LogDetail() {
  const router = useRouter();
  const navigate = useNavigate();
  const { log, files } = Route.useLoaderData();
  const { vehicleId, logId } = useParams({
    from: "/_authed/vehicles/$vehicleId/logs/$logId",
  });

  async function onDelete() {
    if (!window.confirm(`Delete "${log.title}"?`)) return;
    await deleteLogFn({ data: { vehicleId, logId } });
    await router.invalidate();
    navigate({
      to: "/vehicles/$vehicleId/logs",
      params: { vehicleId },
    });
  }

  return (
    <section>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{log.title}</h1>
          <div className="mt-1 text-sm text-slate-500">
            {log.servicedAt.toLocaleDateString()}
            {log.type ? ` · ${log.type}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-sm text-red-600 hover:underline"
        >
          Delete
        </button>
      </div>
      {log.notes ? (
        <p className="mt-4 whitespace-pre-wrap text-slate-700">{log.notes}</p>
      ) : null}
      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        {log.odometer != null ? (
          <div>
            <dt className="text-slate-500">Odometer</dt>
            <dd className="text-slate-900">{log.odometer.toLocaleString()}</dd>
          </div>
        ) : null}
        {log.cost != null ? (
          <div>
            <dt className="text-slate-500">Cost</dt>
            <dd className="text-slate-900">${log.cost.toFixed(2)}</dd>
          </div>
        ) : null}
        {log.selfService ? (
          <div>
            <dt className="text-slate-500">Self-service</dt>
            <dd className="text-slate-900">Yes</dd>
          </div>
        ) : null}
      </dl>

      <LogFilesSection files={files} vehicleId={vehicleId} logId={logId} />
    </section>
  );
}

function LogFilesSection({
  files,
  vehicleId,
  logId,
}: {
  files: LogFile[];
  vehicleId: string;
  logId: string;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageFiles = files.filter((f) => f.category === "image");
  const documentFiles = files.filter((f) => f.category === "document");
  const audioFiles = files.filter((f) => f.category === "audio");

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setUploading(true);
    const formData = new FormData(e.currentTarget);
    formData.set("logId", logId);
    formData.set("vehicleId", vehicleId);
    try {
      const result = await uploadLogFilesFn({ data: formData });
      if (result && "error" in result && result.error) {
        setError(result.error);
      } else {
        (e.target as HTMLFormElement).reset();
        await router.invalidate();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onDeleteFile(fileId: string) {
    if (!window.confirm("Delete this file?")) return;
    await deleteLogFileFn({ data: { fileId } });
    await router.invalidate();
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-medium text-slate-900">Attachments</h2>

      {imageFiles.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-slate-600">Images</h3>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {imageFiles.map((f) => (
              <FileCard key={f.id} file={f} onDelete={onDeleteFile}>
                <img
                  src={`/files/${f.filePath}`}
                  alt={f.description || f.fileName}
                  className="h-32 w-full rounded object-cover"
                />
              </FileCard>
            ))}
          </div>
        </div>
      ) : null}

      {documentFiles.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-slate-600">Documents</h3>
          <ul className="mt-2 space-y-2">
            {documentFiles.map((f) => (
              <FileCard key={f.id} file={f} onDelete={onDeleteFile}>
                <a
                  href={`/files/${f.filePath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  {f.description || f.fileName}
                </a>
              </FileCard>
            ))}
          </ul>
        </div>
      ) : null}

      {audioFiles.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-slate-600">Audio</h3>
          <ul className="mt-2 space-y-2">
            {audioFiles.map((f) => (
              <FileCard key={f.id} file={f} onDelete={onDeleteFile}>
                <div>
                  <div className="text-sm text-slate-700">
                    {f.description || f.fileName}
                  </div>
                  <audio
                    controls
                    src={`/files/${f.filePath}`}
                    className="mt-1 w-full"
                  >
                    <track kind="captions" />
                  </audio>
                </div>
              </FileCard>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={onUpload} className="mt-6 max-w-lg space-y-3">
        {error ? (
          <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <label className="block text-sm font-medium text-slate-700">
          Upload files
          <input
            name="files"
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/heic,application/pdf,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm"
            capture="environment"
            className="mt-1 block w-full text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Description (optional)
          <input
            name="descriptions"
            type="text"
            placeholder="e.g. receipt, before photo"
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </label>
        <button
          type="submit"
          disabled={uploading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>
    </div>
  );
}

function FileCard({
  file,
  onDelete,
  children,
}: {
  file: LogFile;
  onDelete: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      {children}
      {file.description && file.category === "image" ? (
        <p className="mt-1 text-xs text-slate-500">{file.description}</p>
      ) : null}
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>{(file.fileSize / 1024).toFixed(0)} KB</span>
        <button
          type="button"
          onClick={() => onDelete(file.id)}
          className="text-red-500 hover:underline"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
