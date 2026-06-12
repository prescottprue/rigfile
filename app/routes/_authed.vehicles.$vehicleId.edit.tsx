import {
  createFileRoute,
  notFound,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { requireAuth } from "~/auth/session.server";
import { VehicleForm } from "~/components/VehicleForm";
import { getVehicle, updateVehicle } from "~/models/vehicle.server";
import {
  deleteStoredAvatar,
  parseVehicleFields,
  storeAvatarUpload,
} from "~/models/vehicle-form.server";

const loadVehicleForEditFn = createServerFn({ method: "GET" })
  .inputValidator((vehicleId: string) => vehicleId)
  .handler(async ({ data: vehicleId }) => {
    const userId = await requireAuth();
    const vehicle = await getVehicle({ id: vehicleId, userId });
    // Owner-only: members can see the vehicle but not this form.
    if (!vehicle || vehicle.role !== "owner") return null;
    return vehicle;
  });

const updateVehicleFn = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const userId = await requireAuth();
    const vehicleId = String(data.get("vehicleId") ?? "");
    if (!vehicleId) return { error: "Missing vehicle" };

    const fields = parseVehicleFields(data);
    if ("error" in fields) return { error: fields.error };

    // Authz + fetch the current row BEFORE touching storage.
    const existing = await getVehicle({ id: vehicleId, userId });
    if (!existing || existing.role !== "owner") {
      return { error: "Only the owner can edit this vehicle" };
    }

    const stored = await storeAvatarUpload(data, userId);
    if ("error" in stored) return { error: stored.error };

    try {
      const updated = await updateVehicle({
        id: vehicleId,
        userId,
        ...fields,
        ...(stored.avatarPath ? { avatarPath: stored.avatarPath } : {}),
      });
      // Reap the replaced photo's bytes once the row points at the new key.
      if (stored.avatarPath && existing.avatarPath) {
        try {
          await deleteStoredAvatar(existing.avatarPath);
        } catch {
          // Best-effort reap — the row already points at the new key, so a
          // cleanup hiccup must not surface as a failed save.
        }
      }
      return { vehicleId: updated.id };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Failed to save",
      };
    }
  });

export const Route = createFileRoute("/_authed/vehicles/$vehicleId/edit")({
  component: EditVehiclePage,
  loader: async ({ params }) => {
    const vehicle = await loadVehicleForEditFn({ data: params.vehicleId });
    if (!vehicle) throw notFound();
    return vehicle;
  },
});

function EditVehiclePage() {
  const navigate = useNavigate();
  const router = useRouter();
  const v = Route.useLoaderData();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    formData.set("vehicleId", v.id);
    try {
      const result = await updateVehicleFn({ data: formData });
      if (result && "error" in result && result.error) {
        setError(result.error);
      } else {
        // Refresh the layout loader so the header shows the new identity.
        await router.invalidate();
        navigate({ to: "/vehicles/$vehicleId", params: { vehicleId: v.id } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h2 className="text-xl font-bold text-ink">Edit vehicle</h2>
      <VehicleForm
        initialValues={{
          name: v.name ?? "",
          make: v.make,
          model: v.model,
          trim: v.trim ?? "",
          year: String(v.year),
          vin: v.vin ?? "",
          engine: v.engine ?? "",
        }}
        currentAvatarUrl={v.avatarPath ? `/files/${v.avatarPath}` : null}
        submitLabel="Save changes"
        pending={pending}
        error={error}
        onSubmit={onSubmit}
      />
    </section>
  );
}
