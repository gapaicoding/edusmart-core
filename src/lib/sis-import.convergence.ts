import type { SisAction } from "./sis-import.constants";

/** Converts an update candidate into a semantic no-op only when every comparable persisted field is equal. */
export function convergeSisImportAction(
  action: SisAction,
  normalized: Record<string, unknown>,
  expected: Record<string, unknown> | null,
): SisAction {
  if (action !== "update" || !expected) return action;
  const comparable = Object.keys(expected).filter((key) => key in normalized);
  return comparable.length > 0 &&
    comparable.every(
      (key) => JSON.stringify(expected[key] ?? null) === JSON.stringify(normalized[key] ?? null),
    )
    ? "unchanged"
    : action;
}

