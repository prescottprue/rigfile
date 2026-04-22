import { createId } from "@paralleldrive/cuid2";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { useAppSession } from "~/auth/session.server";
import { createVehicle } from "~/models/vehicle.server";
import { getStorage } from "~/storage.server";

const MAX_AVATAR_BYTES = 500 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg"]);

const createVehicleFn = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const session = await useAppSession();
    const userId = session.data.userId;
    if (!userId)
      throw redirect({ to: "/login", search: { redirectTo: undefined } });

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

    throw redirect({
      to: "/vehicles/$vehicleId",
      params: { vehicleId: vehicle.id },
    });
  });

export const Route = createFileRoute("/_authed/vehicles/new")({
  component: NewVehiclePage,
});

function NewVehiclePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData(e.currentTarget);
    try {
      const result = await createVehicleFn({ data: formData });
      if (result && "error" in result) {
        setError(result.error);
      } else {
        await router.invalidate();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-900">Add vehicle</h1>
      <form onSubmit={onSubmit} className="mt-6 max-w-lg space-y-4">
        {error ? (
          <p className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <Field name="name" label="Name (optional)" />
        <Field name="make" label="Make" required />
        <Field name="model" label="Model" required />
        <Field name="trim" label="Trim (optional)" />
        <Field name="year" label="Year" type="number" required />
        <label className="block text-sm font-medium text-slate-700">
          Avatar (PNG or JPEG, ≤500KB, optional)
          <input
            name="avatar"
            type="file"
            accept="image/png,image/jpeg"
            className="mt-1 block w-full text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
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
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 w-full rounded border border-slate-300 p-2"
      />
    </label>
  );
}
