import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { requireAuth } from "~/auth/session.server";
import { VehicleForm } from "~/components/VehicleForm";
import { createVehicle } from "~/models/vehicle.server";
import {
  parseVehicleFields,
  storeAvatarUpload,
} from "~/models/vehicle-form.server";

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
