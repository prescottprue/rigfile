import { createId } from "@paralleldrive/cuid2";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { requireAuth } from "~/auth/session.server";
import { ImageCropper } from "~/components/ImageCropper";
import { btnSecondary, card } from "~/components/ui";
import { downscaleImage } from "~/lib/image";
import { changePassword, updateUser } from "~/models/user.server";
import { getStorage } from "~/storage.server";

const MAX_AVATAR_BYTES = 500 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg"]);

const updateProfileFn = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();

    const displayName = String(data.get("displayName") ?? "").trim() || null;

    let avatarPath: string | null | undefined;
    const avatar = data.get("avatar");
    if (avatar instanceof File && avatar.size > 0) {
      if (avatar.size > MAX_AVATAR_BYTES) {
        return { error: "Avatar must be 500KB or smaller" as const };
      }
      if (!ALLOWED_AVATAR_TYPES.has(avatar.type)) {
        return { error: "Avatar must be PNG or JPEG" as const };
      }
      const bytes = new Uint8Array(await avatar.arrayBuffer());
      const key = `user-avatars/${userId}/${createId()}`;
      await getStorage().upload(key, bytes, avatar.type);
      avatarPath = key;
    }

    const updates: { displayName: string | null; avatarPath?: string } = {
      displayName,
    };
    if (avatarPath) {
      updates.avatarPath = avatarPath;
    }

    await updateUser(userId, updates);
    return { success: true as const };
  });

const changePasswordFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const userId = await requireAuth();

    if (data.newPassword.length < 8) {
      return { error: "New password must be at least 8 characters" };
    }
    if (data.newPassword !== data.confirmPassword) {
      return { error: "Passwords do not match" };
    }

    const result = await changePassword(
      userId,
      data.currentPassword,
      data.newPassword,
    );
    if (result.error) return { error: result.error };
    return { success: true as const };
  });

export const Route = createFileRoute("/_authed/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();

  return (
    <section className="space-y-10">
      <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
      <ProfileForm user={user} />
      <hr className="border-slate-200" />
      <PasswordForm />
      <hr className="border-slate-200" />
      <ConnectClaude />
      <hr className="border-slate-200" />
      <YourData />
    </section>
  );
}

function ConnectClaude() {
  // window.location is browser-only; render the path until hydration fills
  // in the full origin.
  const [mcpUrl, setMcpUrl] = useState("/mcp");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMcpUrl(`${window.location.origin}/mcp`);
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <h2 className="text-lg font-medium text-slate-900">
        🤖 Connect Claude (MCP)
      </h2>
      <div className={`${card} mt-4 max-w-lg p-5`}>
        <p className="text-sm text-ink-muted">
          Logbook is an MCP server, so you can talk to your garage from your own
          Claude account — "what's due on the Jeep?", "log the oil change I just
          did at 87,420 miles" — from a phone, mid-wrench. Claude signs in as{" "}
          <em>you</em>: it can only see and log to vehicles your account can
          access.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
          <li>
            In Claude (web or mobile), open{" "}
            <span className="font-medium text-ink">
              Settings → Connectors → Add custom connector
            </span>
          </li>
          <li>Paste the URL below</li>
          <li>Sign in with your Logbook account and approve access</li>
        </ol>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            readOnly
            value={mcpUrl}
            aria-label="MCP connector URL"
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-11 w-full rounded-xl border border-line bg-sunken px-3 font-mono text-sm text-ink"
          />
          <button type="button" onClick={copy} className={btnSecondary}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Claude can list your vehicles, check what's due, log completed work,
          complete reminders, and manage project parts. Connections use OAuth —
          no API keys, and your password is never shared with Claude.
        </p>
      </div>
    </div>
  );
}

function YourData() {
  return (
    <div>
      <h2 className="text-lg font-medium text-slate-900">🔓 Your data</h2>
      <div className={`${card} mt-4 max-w-lg p-5`}>
        <p className="text-sm text-ink-muted">
          Your records belong to you. Download your complete history — vehicles,
          logs, readings, vendors, tags, and parts — as JSON at any time.
          Logbook is also{" "}
          <a
            href="https://github.com/prescottprue/logbook"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent hover:underline"
          >
            open source
          </a>
          , so you can always run your own instance and bring this export with
          you.
        </p>
        <a href="/account/export" download className={`${btnSecondary} mt-4`}>
          ⬇️ Export everything (JSON)
        </a>
      </div>
    </div>
  );
}

function ProfileForm({
  user,
}: {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarPath: string | null;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  // Raw photo awaiting a square crop before it becomes the avatar.
  const [cropping, setCropping] = useState<File | null>(null);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    // The file input is cleared once a photo is cropped, so inject the
    // cropped avatar here (already squared + downscaled under the 500KB cap).
    if (avatarFile) formData.set("avatar", avatarFile);
    try {
      const result = await updateProfileFn({ data: formData });
      if (result && "error" in result && result.error) {
        setError(String(result.error));
      } else {
        setSuccess(true);
        setAvatarFile(null);
        await router.invalidate();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-medium text-slate-900">Account details</h2>
      <form onSubmit={onSubmit} className="mt-4 max-w-lg space-y-4">
        {error ? (
          <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-700">
            Profile updated.
          </p>
        ) : null}

        <div>
          <label
            htmlFor="profile-email"
            className="block text-sm font-medium text-slate-700"
          >
            Email
          </label>
          <input
            id="profile-email"
            type="email"
            value={user.email}
            disabled
            className="mt-1 w-full rounded border border-slate-200 bg-slate-50 p-2 text-slate-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Email cannot be changed at this time.
          </p>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          Display name
          <input
            name="displayName"
            type="text"
            defaultValue={user.displayName ?? ""}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </label>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Profile image (cropped to a square)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                e.currentTarget.value = "";
                if (picked) setCropping(picked);
              }}
              className="mt-1 block w-full text-sm"
            />
          </label>
          {avatarPreview || user.avatarPath ? (
            <img
              src={avatarPreview ?? `/files/${user.avatarPath}`}
              alt={avatarPreview ? "New avatar" : "Current avatar"}
              className="mt-2 h-20 w-20 rounded-full object-cover"
            />
          ) : null}
        </div>

        {cropping ? (
          <ImageCropper
            file={cropping}
            aspect={1}
            onCancel={() => setCropping(null)}
            onConfirm={async (cropped) => {
              setCropping(null);
              setAvatarFile(
                await downscaleImage(cropped, { maxDim: 512, quality: 0.85 }),
              );
            }}
          />
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

function PasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);
    const form = e.currentTarget;
    const currentPassword = String(
      new FormData(form).get("currentPassword") ?? "",
    );
    const newPassword = String(new FormData(form).get("newPassword") ?? "");
    const confirmPassword = String(
      new FormData(form).get("confirmPassword") ?? "",
    );
    try {
      const result = await changePasswordFn({
        data: { currentPassword, newPassword, confirmPassword },
      });
      if (result && "error" in result && result.error) {
        setError(String(result.error));
      } else {
        setSuccess(true);
        form.reset();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change password",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-medium text-slate-900">Change password</h2>
      <form onSubmit={onSubmit} className="mt-4 max-w-lg space-y-4">
        {error ? (
          <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-700">
            Password changed successfully.
          </p>
        ) : null}

        <label className="block text-sm font-medium text-slate-700">
          Current password
          <input
            name="currentPassword"
            type="password"
            required
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          New password
          <input
            name="newPassword"
            type="password"
            required
            minLength={8}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Changing…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
