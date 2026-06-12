import { useState } from "react";

import {
  btnPrimary,
  btnSecondary,
  errorBox,
  input,
  label as labelClass,
} from "~/components/ui";
import { downscaleImage } from "~/lib/image.client";
import { decodeVin, getMakes, getModelsForMakeYear } from "~/lib/vpic";

export type VehicleFormValues = {
  name: string;
  make: string;
  model: string;
  trim: string;
  year: string;
  vin: string;
  engine: string;
};

const EMPTY: VehicleFormValues = {
  name: "",
  make: "",
  model: "",
  trim: "",
  year: "",
  vin: "",
  engine: "",
};

type VinStatus = "idle" | "loading" | "done" | "failed";

/**
 * Shared create/edit vehicle form. Routes own the server functions; this
 * component owns field state, the vPIC assists (VIN decode + make/model
 * datalists — all best-effort, every field stays free-text), and avatar
 * downscaling. Submits a FormData with keys: name, make, model, trim,
 * year, vin, engine, avatar (file, optional).
 */
export function VehicleForm({
  initialValues,
  currentAvatarUrl,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  initialValues?: Partial<VehicleFormValues>;
  currentAvatarUrl?: string | null;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const [values, setValues] = useState<VehicleFormValues>({
    ...EMPTY,
    ...initialValues,
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [vinStatus, setVinStatus] = useState<VinStatus>("idle");
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);

  function set<K extends keyof VehicleFormValues>(
    key: K,
    value: VehicleFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onVinLookup() {
    if (!values.vin.trim()) return;
    setVinStatus("loading");
    const decoded = await decodeVin(values.vin);
    if (!decoded) {
      setVinStatus("failed");
      return;
    }
    setValues((v) => ({
      ...v,
      year: decoded.year || v.year,
      make: decoded.make || v.make,
      model: decoded.model || v.model,
      trim: decoded.trim || v.trim,
      engine: decoded.engine || v.engine,
    }));
    setVinStatus("done");
  }

  async function loadMakes() {
    if (makes.length === 0) setMakes(await getMakes());
  }

  async function loadModels() {
    const year = Number.parseInt(values.year, 10);
    if (!values.make || !Number.isFinite(year)) return;
    setModels(await getModelsForMakeYear(values.make, year));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("name", values.name);
    fd.set("make", values.make);
    fd.set("model", values.model);
    fd.set("trim", values.trim);
    fd.set("year", values.year);
    fd.set("vin", values.vin);
    fd.set("engine", values.engine);
    if (avatarFile && avatarFile.size > 0) {
      fd.set(
        "avatar",
        await downscaleImage(avatarFile, { maxDim: 1024, quality: 0.85 }),
      );
    }
    await onSubmit(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-lg space-y-4">
      {error ? <p className={errorBox}>{error}</p> : null}

      <div className="flex items-end gap-2">
        <label className={`${labelClass} flex-1`}>
          VIN (optional) — look it up to prefill the rest
          <input
            value={values.vin}
            onChange={(e) => {
              set("vin", e.target.value);
              setVinStatus("idle");
            }}
            placeholder="1C4HJXDG5JW123456"
            className={`${input} font-mono uppercase`}
          />
        </label>
        <button
          type="button"
          onClick={onVinLookup}
          disabled={vinStatus === "loading" || !values.vin.trim()}
          className={btnSecondary}
        >
          {vinStatus === "loading" ? "Looking up…" : "Look up"}
        </button>
      </div>
      {vinStatus === "failed" ? (
        <p className="text-sm text-warn">
          Couldn't decode that VIN — fill the fields in below.
        </p>
      ) : null}
      {vinStatus === "done" ? (
        <p className="text-sm text-ok">
          Prefilled from the VIN — check it over.
        </p>
      ) : null}

      <label className={labelClass}>
        Name (optional)
        <input
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Rally Rig"
          className={input}
        />
      </label>
      <label className={labelClass}>
        Year
        <input
          type="number"
          required
          value={values.year}
          onChange={(e) => set("year", e.target.value)}
          className={input}
        />
      </label>
      <label className={labelClass}>
        Make
        <input
          required
          value={values.make}
          onChange={(e) => set("make", e.target.value)}
          onFocus={loadMakes}
          list="vehicle-makes"
          className={input}
        />
      </label>
      <datalist id="vehicle-makes">
        {makes.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <label className={labelClass}>
        Model
        <input
          required
          value={values.model}
          onChange={(e) => set("model", e.target.value)}
          onFocus={loadModels}
          list="vehicle-models"
          className={input}
        />
      </label>
      <datalist id="vehicle-models">
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <label className={labelClass}>
        Trim (optional)
        <input
          value={values.trim}
          onChange={(e) => set("trim", e.target.value)}
          placeholder="Rubicon"
          className={input}
        />
      </label>
      <label className={labelClass}>
        Engine (optional)
        <input
          value={values.engine}
          onChange={(e) => set("engine", e.target.value)}
          placeholder="3.6L V6 Pentastar"
          className={input}
        />
      </label>

      {currentAvatarUrl ? (
        <img
          src={currentAvatarUrl}
          alt="Current vehicle"
          className="h-20 w-20 rounded-2xl object-cover"
        />
      ) : null}
      <label className={labelClass}>
        Photo (optional{currentAvatarUrl ? " — replaces the current one" : ""})
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-ink"
        />
      </label>

      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
