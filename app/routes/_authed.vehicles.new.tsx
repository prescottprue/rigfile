import { createId } from "@paralleldrive/cuid2";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { requireAuth } from "~/auth/session.server";
import {
  btnPrimary,
  errorBox,
  input,
  label as labelClass,
} from "~/components/ui";
import { createVehicle } from "~/models/vehicle.server";
import { getStorage } from "~/storage.server";

const MAX_AVATAR_BYTES = 500 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg"]);

const createVehicleFn = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();

    const name = String(data.get("name") ?? "").trim() || null;
    const make = String(data.get("make") ?? "").trim();
    const model = String(data.get("model") ?? "").trim();
    const trim = String(data.get("trim") ?? "").trim() || null;
    const yearRaw = String(data.get("year") ?? "").trim();
    const year = Number.parseInt(yearRaw, 10);

    if (!make || !model || !Number.isFinite(year)) {
      return { error: "Make, model, and year are required" as const };
    }

    let avatarPath: string | null = null;
    const avatar = data.get("avatar");
    if (avatar instanceof File && avatar.size > 0) {
      if (avatar.size > MAX_AVATAR_BYTES) {
        return { error: "Avatar must be 500KB or smaller" as const };
      }
      if (!ALLOWED_AVATAR_TYPES.has(avatar.type)) {
        return { error: "Avatar must be PNG or JPEG" as const };
      }
      const bytes = new Uint8Array(await avatar.arrayBuffer());
      const key = `vehicle-avatars/${userId}/${createId()}`;
      await getStorage().upload(key, bytes, avatar.type);
      avatarPath = key;
    }

    const vehicle = await createVehicle({
      userId,
      name,
      make,
      model,
      trim,
      year,
      avatarPath,
    });

    return { vehicleId: vehicle.id };
  });

export const Route = createFileRoute("/_authed/vehicles/new")({
  component: NewVehiclePage,
});

function NewVehiclePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    try {
      const result = await createVehicleFn({ data: formData });
      if (result && "error" in result && result.error) {
        setError(result.error);
      } else if (result && "vehicleId" in result) {
        navigate({
          to: "/vehicles/$vehicleId",
          params: { vehicleId: result.vehicleId },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-bold text-ink">Add vehicle</h1>
      <form onSubmit={onSubmit} className="mt-6 max-w-lg space-y-4">
        {error ? <p className={errorBox}>{error}</p> : null}
        <Field name="name" label="Name (optional)" />
        <Field name="make" label="Make" required />
        <Field name="model" label="Model" required />
        <Field name="trim" label="Trim (optional)" />
        <Field name="year" label="Year" type="number" required />
        <label className={labelClass}>
          Photo (PNG or JPEG, ≤500KB, optional)
          <input
            name="avatar"
            type="file"
            accept="image/png,image/jpeg"
            className="mt-1 block w-full text-sm text-ink"
          />
        </label>
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </section>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className={labelClass}>
      {label}
      <input name={name} type={type} required={required} className={input} />
    </label>
  );
}
