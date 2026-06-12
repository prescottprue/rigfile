/**
 * NHTSA vPIC lookups for the vehicle form. Client-only by design: vPIC
 * supports CORS, so the browser calls it directly — no Worker egress,
 * identical behavior on self-host. Every call degrades to "no data" on
 * failure; the form treats that as normal (free-text entry).
 */

const VPIC_BASE = "https://vpic.nhtsa.dot.gov/api/vehicles";
const TIMEOUT_MS = 5000;

// biome-ignore lint/suspicious/noExplicitAny: vPIC's response envelope is untyped JSON.
async function vpicFetch(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${VPIC_BASE}/${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function present(value: string | undefined): value is string {
  return !!value && value !== "Not Applicable";
}

/** The subset of DecodeVinValues result fields we read. */
export type VpicVinResult = {
  ModelYear?: string;
  Make?: string;
  Model?: string;
  Series?: string;
  Trim?: string;
  DisplacementL?: string;
  EngineCylinders?: string;
  EngineConfiguration?: string;
  Turbo?: string;
  EngineModel?: string;
};

/**
 * "3.6L V6 Pentastar", "2.0L I4 Turbo" — built from vPIC's separate engine
 * fields. Pure and exported for tests.
 */
export function buildEngineString(r: VpicVinResult): string {
  const parts: string[] = [];

  const liters = present(r.DisplacementL)
    ? Number.parseFloat(r.DisplacementL)
    : NaN;
  if (Number.isFinite(liters)) parts.push(`${liters.toFixed(1)}L`);

  const cylinders = present(r.EngineCylinders)
    ? Number.parseInt(r.EngineCylinders, 10)
    : NaN;
  if (Number.isFinite(cylinders)) {
    const config = (r.EngineConfiguration ?? "").toLowerCase();
    const prefix = config.startsWith("v")
      ? "V"
      : config.includes("line")
        ? "I"
        : "";
    parts.push(prefix ? `${prefix}${cylinders}` : `${cylinders}-cyl`);
  }

  if ((r.Turbo ?? "").toLowerCase() === "yes") parts.push("Turbo");
  if (present(r.EngineModel)) parts.push(r.EngineModel);

  return parts.join(" ");
}

/** vPIC SHOUTS make names ("JEEP") — title-case them for form fields. */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])\w/g, (c) => c.toUpperCase());
}

export type DecodedVin = {
  year: string;
  make: string;
  model: string;
  trim: string;
  engine: string;
};

export async function decodeVin(vin: string): Promise<DecodedVin | null> {
  const trimmed = vin.trim().toUpperCase();
  if (!trimmed) return null;
  const json = await vpicFetch(
    `DecodeVinValues/${encodeURIComponent(trimmed)}?format=json`,
  );
  const r: VpicVinResult | undefined = json?.Results?.[0];
  if (!r || !present(r.Make)) return null;
  return {
    year: present(r.ModelYear) ? r.ModelYear : "",
    make: titleCase(r.Make),
    model: present(r.Model) ? r.Model : "",
    trim: [r.Series, r.Trim].filter(present).join(" "),
    engine: buildEngineString(r),
  };
}

let makesCache: string[] | null = null;

export async function getMakes(): Promise<string[]> {
  if (makesCache) return makesCache;
  const json = await vpicFetch("GetMakesForVehicleType/car?format=json");
  const makes: string[] = (json?.Results ?? [])
    .map((r: { MakeName?: string }) => r.MakeName)
    .filter((m: string | undefined): m is string => !!m)
    .map(titleCase)
    .sort();
  if (makes.length) makesCache = makes;
  return makes;
}

export async function getModelsForMakeYear(
  make: string,
  year: number,
): Promise<string[]> {
  if (!make || !Number.isFinite(year)) return [];
  const json = await vpicFetch(
    `GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`,
  );
  return (json?.Results ?? [])
    .map((r: { Model_Name?: string }) => r.Model_Name)
    .filter((m: string | undefined): m is string => !!m)
    .sort();
}
