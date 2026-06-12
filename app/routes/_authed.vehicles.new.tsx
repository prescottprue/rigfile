import { createId } from "@paralleldrive/cuid2";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { requireAuth } from "~/auth/session.server";
import { VehicleForm } from "~/components/VehicleForm";
import { createVehicle } from "~/models/vehicle.server";
import { getStorage } from "~/storage.server";

// The client downscales to ~1024px JPEG first; this is just headroom for
// the PNG-passthrough path and defense-in-depth.
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg"]);

/** Shared by the create and edit routes: parse + store an avatar upload. */
export async function storeAvatarUpload(
  data: FormData,
  userId: string,
): Promise<{ error: string } | { avatarPath: string | null }> {
  const avatar = data.get("avatar");
  if (!(avatar instanceof File) || avatar.size === 0) {
    return { avatarPath: null };
  }
  if (avatar.size > MAX_AVATAR_BYTES) {
    return { error: "Photo must be 2MB or smaller" };
  }
  if (!ALLOWED_AVATAR_TYPES.has(avatar.type)) {
    return { error: "Photo must be PNG or JPEG" };
  }
  const bytes = new Uint8Array(await avatar.arrayBuffer());
  const key = `vehicle-avatars/${userId}/${createId()}`;
  await getStorage().upload(key, bytes, avatar.type);
  return { avatarPath: key };
}

/** Shared by the create and edit routes: parse the VehicleForm fields. */
export function parseVehicleFields(data: FormData):
  | { error: string }
  | {
      name: string | null;
      make: string;
      model: string;
      trim: string | null;
      year: number;
      vin: string | null;
      engine: string | null;
    } {
  const name = String(data.get("name") ?? "").trim() || null;
  const make = String(data.get("make") ?? "").trim();
  const model = String(data.get("model") ?? "").trim();
  const trim = String(data.get("trim") ?? "").trim() || null;
  const year = Number.parseInt(String(data.get("year") ?? "").trim(), 10);
  const vin = String(data.get("vin") ?? "").trim() || null;
  const engine = String(data.get("engine") ?? "").trim() || null;
  if (!make || !model || !Number.isFinite(year)) {
    return { error: "Make, model, and year are required" };
  }
  return { name, make, model, trim, year, vin, engine };
}

const createVehicleFn = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();

    const fields = parseVehicleFields(data);
    if ("error" in fields) return { error: fields.error };

    const stored = await storeAvatarUpload(data, userId);
    if ("error" in stored) return { error: stored.error };

    const vehicle = await createVehicle({
      userId,
      ...fields,
      vin: fields.vin ? fields.vin.toUpperCase() : null,
      avatarPath: stored.avatarPath,
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

  async function onSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await createVehicleFn({ data: formData });
      if (result && "error" in result && result.error) {
        setError(result.error);
      } else if (result && "vehicleId" in result && result.vehicleId) {
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
      <VehicleForm
        submitLabel="Save"
        pending={pending}
        error={error}
        onSubmit={onSubmit}
      />
    </section>
  );
}
