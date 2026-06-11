import {
  createFileRoute,
  notFound,
  useNavigate,
  useParams,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";

import { requireAuth } from "~/auth/session.server";
import { card, errorBox } from "~/components/ui";
import {
  addLogAttachment,
  listLogAttachments,
  removeLogAttachment,
} from "~/models/attachment.server";
import { deleteLog, getLog } from "~/models/log.server";

const loadLogFn = createServerFn({ method: "GET" })
  .inputValidator((input: { vehicleId: string; logId: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const log = await getLog({
      id: data.logId,
      userId,
      vehicleId: data.vehicleId,
    });
    if (!log) return null;
    const attachments = await listLogAttachments({
      logId: data.logId,
      vehicleId: data.vehicleId,
      userId,
    });
    return { ...log, attachments };
  });

const deleteLogFn = createServerFn({ method: "POST" })
  .inputValidator((input: { vehicleId: string; logId: string }) => input)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    await deleteLog({ id: data.logId, userId, vehicleId: data.vehicleId });
    return { vehicleId: data.vehicleId };
  });

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const uploadAttachmentsFn = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const vehicleId = String(data.get("vehicleId") ?? "");
    const logId = String(data.get("logId") ?? "");
    if (!vehicleId || !logId) return { error: "Missing log" };

    const files = data
      .getAll("files")
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return { error: "No files selected" };
    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return { error: `${file.name} is too large (8 MB max)` };
      }
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
        return { error: `${file.name}: only images and PDFs` };
      }
    }

    for (const file of files) {
      await addLogAttachment({
        logId,
        vehicleId,
        userId,
        body: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type,
        originalName: file.name,
        kind: file.type.startsWith("image/") ? "photo" : "document",
      });
    }
    return { count: files.length };
  });

const deleteAttachmentFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { vehicleId: string; logId: string; attachmentId: string }) =>
      input,
  )
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const deleted = await removeLogAttachment({
      id: data.attachmentId,
      logId: data.logId,
      vehicleId: data.vehicleId,
      userId,
    });
    return { deleted: deleted != null };
  });

export const Route = createFileRoute(
  "/_authed/vehicles/$vehicleId/logs/$logId",
)({
  component: LogDetail,
  loader: async ({ params }) => {
    const log = (await loadLogFn({ data: params })) ?? null;
    if (!log) throw notFound();
    return log;
  },
});

function LogDetail() {
  const router = useRouter();
  const navigate = useNavigate();
  const log = Route.useLoaderData();
  const { vehicleId, logId } = useParams({
    from: "/_authed/vehicles/$vehicleId/logs/$logId",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);

  async function onDelete() {
    if (!window.confirm(`Delete "${log.title}"?`)) return;
    await deleteLogFn({ data: { vehicleId, logId } });
    await router.invalidate();
    navigate({
      to: "/vehicles/$vehicleId/logs",
      params: { vehicleId },
    });
  }

  async function onAddFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setAttachError(null);
    setUploading(true);
    const formData = new FormData();
    formData.set("vehicleId", vehicleId);
    formData.set("logId", logId);
    for (const file of picked) formData.append("files", file);
    try {
      const result = await uploadAttachmentsFn({ data: formData });
      if ("error" in result && result.error) {
        setAttachError(result.error);
      } else {
        await router.invalidate();
      }
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDeleteAttachment(att: {
    id: string;
    originalName: string | null;
  }) {
    if (!window.confirm(`Delete ${att.originalName ?? "this attachment"}?`))
      return;
    setAttachError(null);
    await deleteAttachmentFn({
      data: { vehicleId, logId, attachmentId: att.id },
    });
    await router.invalidate();
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">{log.title}</h2>
          <div className="mt-1 text-sm text-ink-muted">
            {log.servicedAt.toLocaleDateString()}
            {log.type ? ` · ${log.type}` : ""}
            {log.authorName ? ` · logged by ${log.authorName}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 text-sm text-danger hover:underline"
        >
          Delete
        </button>
      </div>
      {log.notes ? (
        <p className="mt-4 whitespace-pre-wrap text-ink">{log.notes}</p>
      ) : null}
      <dl
        className={`${card} mt-6 grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-3`}
      >
        <div>
          <dt className="text-ink-muted">Odometer</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-ink">
            {log.odometer != null
              ? `${Math.round(log.odometer).toLocaleString()} mi`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Cost</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-ink">
            {log.cost != null ? `$${log.cost.toFixed(2)}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Who did it</dt>
          <dd className="mt-0.5 font-semibold text-ink">
            {log.selfService ? "DIY 🔧" : "Shop"}
          </dd>
        </div>
      </dl>
      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink-muted">
            Scans & attachments
          </h3>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-sm font-semibold text-accent hover:underline disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "+ Add files"}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          aria-label="Add photos or PDFs to this log"
          onChange={(e) => onAddFiles(e.target.files)}
        />
        {attachError ? (
          <p className={`${errorBox} mt-2`}>{attachError}</p>
        ) : null}
        {log.attachments.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            No files yet — add the receipt photo, an invoice PDF, or a shot of
            the finished work.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-3">
            {log.attachments.map((att) => {
              const href = `/files/${att.path}`;
              const isImage = att.contentType.startsWith("image/");
              return (
                <li key={att.id} className="relative">
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={`${card} block overflow-hidden transition-colors hover:bg-sunken`}
                    title={att.originalName ?? "Attachment"}
                  >
                    {isImage ? (
                      <img
                        src={href}
                        alt={att.originalName ?? "Scan"}
                        className="h-32 w-32 object-cover"
                      />
                    ) : (
                      <span className="flex h-32 w-32 items-center justify-center text-4xl">
                        📄
                      </span>
                    )}
                  </a>
                  <button
                    type="button"
                    aria-label={`Delete ${att.originalName ?? "attachment"}`}
                    onClick={() => onDeleteAttachment(att)}
                    className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-card text-xs font-bold text-danger shadow-sm hover:bg-danger/10"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
