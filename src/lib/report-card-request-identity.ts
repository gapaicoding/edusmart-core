import { useCallback, useRef, useState } from "react";
import { ReportCardRuntimeError } from "./report-card-runtime.server";

export type ReportCardRequestAction<T> = {
  requestId: string;
  payload: T;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function acquireReportCardRequestAction<T>(
  current: ReportCardRequestAction<T> | null,
  payload: T,
  makeId: () => string = () => crypto.randomUUID(),
): ReportCardRequestAction<T> | null {
  if (current) return canonical(current.payload) === canonical(payload) ? current : null;
  return { requestId: makeId(), payload };
}

export function reportCardFailureIsDefinitive(error: unknown): boolean {
  const knownCodes = new Set([
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "SCOPE_MISMATCH",
    "NOT_FOUND",
    "INVALID_STATE",
    "STALE_VERSION",
    "REQUEST_CONFLICT",
    "INVALID_CONTENT",
    "SNAPSHOT_INVALID",
    "PUBLISHED_IMMUTABLE",
    "REVISION_REASON_REQUIRED",
    "REVISION_FORBIDDEN",
    "REVISION_SOURCE_INVALID",
  ]);
  if (error instanceof ReportCardRuntimeError) return knownCodes.has(error.code);
  if (error && typeof error === "object" && "code" in error) {
    return typeof error.code === "string" && knownCodes.has(error.code);
  }
  if (error instanceof Error && /changed|stale version|reload the latest/i.test(error.message)) {
    return true;
  }
  return false;
}

export function useReportCardRequestAction<T>() {
  const current = useRef<ReportCardRequestAction<T> | null>(null);
  const inFlight = useRef(false);
  const [retryAction, setRetryAction] = useState<ReportCardRequestAction<T> | null>(null);

  const begin = useCallback((payload: T) => {
    if (inFlight.current) return null;
    const action = acquireReportCardRequestAction(current.current, payload);
    if (!action) return null;
    current.current = action;
    inFlight.current = true;
    setRetryAction(null);
    return action;
  }, []);

  const retry = useCallback(() => {
    const action = current.current;
    if (!action || !retryAction || retryAction.requestId !== action.requestId) return null;
    if (inFlight.current) return null;
    inFlight.current = true;
    setRetryAction(null);
    return action;
  }, [retryAction]);

  const succeed = useCallback((action: ReportCardRequestAction<T>) => {
    if (current.current?.requestId !== action.requestId) return;
    inFlight.current = false;
    current.current = null;
    setRetryAction(null);
  }, []);

  const fail = useCallback((error: unknown, action: ReportCardRequestAction<T>) => {
    if (current.current?.requestId !== action.requestId) return;
    inFlight.current = false;
    if (reportCardFailureIsDefinitive(error)) {
      current.current = null;
      setRetryAction(null);
    } else {
      setRetryAction(action);
    }
  }, []);

  return { begin, retry, succeed, fail, retryAction };
}
