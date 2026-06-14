/**
 * Vehicle-document kind vocabulary. Lives in a `.shared.ts` (not the
 * `.server.ts` model) because route components need the labels/list and
 * client code can't import values from server-only modules.
 */

export const DOCUMENT_KINDS = [
  "purchase",
  "title",
  "registration",
  "insurance",
  "bill_of_sale",
  "warranty",
  "other",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  purchase: "Purchase / contract",
  title: "Title",
  registration: "Registration",
  insurance: "Insurance",
  bill_of_sale: "Bill of sale",
  warranty: "Warranty",
  other: "Other",
};

export function documentKindLabel(kind: string): string {
  return (
    DOCUMENT_KIND_LABELS[kind as DocumentKind] ?? DOCUMENT_KIND_LABELS.other
  );
}

/** Coerce arbitrary input (form value, import) to a known kind. */
export function normalizeDocumentKind(
  kind: string | null | undefined,
): DocumentKind {
  return DOCUMENT_KINDS.includes(kind as DocumentKind)
    ? (kind as DocumentKind)
    : "other";
}
