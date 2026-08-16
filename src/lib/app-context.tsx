import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAcademicContext,
  getSessionContext,
  type AcademicYearSummary,
  type OrganizationContext,
  type SchoolSummary,
  type SessionContext,
  type TermSummary,
} from "./context.functions";

/**
 * Active context (organization / school / academic year / term).
 *
 * Stored selections are UX and filtering only — never proof of authorization.
 * Every stored id is re-validated on load against the RLS-backed snapshot, and
 * the database still enforces access on every read and write.
 */

const STORAGE_KEYS = {
  organization: "edusmart.activeOrganizationId",
  school: "edusmart.activeSchoolId",
  academicYear: "edusmart.activeAcademicYearId",
  term: "edusmart.activeTermId",
} as const;

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

function writeStored(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(key, value);
  else window.localStorage.removeItem(key);
}

type AppContextValue = {
  isLoading: boolean;
  /** Session/profile identity still resolving (never true on error). */
  identityLoading: boolean;
  /** Organization/school selection still resolving from memberships. */
  contextLoading: boolean;
  error: Error | null;
  refetch: () => void;
  snapshot: SessionContext | undefined;
  organizations: OrganizationContext[];
  activeOrganization: OrganizationContext | null;
  activeSchool: SchoolSummary | null;
  academicYears: AcademicYearSummary[];
  terms: TermSummary[];
  activeAcademicYear: AcademicYearSummary | null;
  activeTerm: TermSummary | null;
  academicLoading: boolean;
  /** Academic year selection still settling after a successful fetch. */
  academicYearLoading: boolean;
  /** Term selection still settling after a successful fetch. */
  termLoading: boolean;
  permissions: string[];
  hasPermission: (code: string) => boolean;
  setOrganization: (id: string) => void;
  setSchool: (id: string) => void;
  setAcademicYear: (id: string) => void;
  setTerm: (id: string) => void;
};


const AppContext = createContext<AppContextValue | null>(null);

export function AppContextProvider({ children }: { children: ReactNode }) {
  const fetchSessionContext = useServerFn(getSessionContext);
  const fetchAcademicContext = useServerFn(getAcademicContext);

  const sessionQuery = useQuery({
    queryKey: ["session-context"],
    queryFn: () => fetchSessionContext(),
    staleTime: 60_000,
  });

  const organizations = useMemo(
    () => sessionQuery.data?.organizations ?? [],
    [sessionQuery.data],
  );

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [academicYearId, setAcademicYearId] = useState<string | null>(null);
  const [termId, setTermId] = useState<string | null>(null);

  // Validate the organization selection against real memberships.
  useEffect(() => {
    if (!sessionQuery.data) return;
    const stored = organizationId ?? readStored(STORAGE_KEYS.organization);
    const valid = organizations.find((o) => o.organizationId === stored);
    const next = valid?.organizationId ?? (organizations.length === 1 ? organizations[0]!.organizationId : null);
    if (next !== organizationId) {
      setOrganizationId(next);
      writeStored(STORAGE_KEYS.organization, next);
    }
  }, [sessionQuery.data, organizations, organizationId]);

  const activeOrganization = useMemo(
    () => organizations.find((o) => o.organizationId === organizationId) ?? null,
    [organizations, organizationId],
  );

  // Validate the school selection against membership_school_access.
  useEffect(() => {
    if (!activeOrganization) return;
    const stored = schoolId ?? readStored(STORAGE_KEYS.school);
    const valid = activeOrganization.schools.find((s) => s.id === stored);
    const next =
      valid?.id ?? (activeOrganization.schools.length === 1 ? activeOrganization.schools[0]!.id : null);
    if (next !== schoolId) {
      setSchoolId(next);
      writeStored(STORAGE_KEYS.school, next);
    }
  }, [activeOrganization, schoolId]);

  const academicQuery = useQuery({
    queryKey: ["academic-context", schoolId],
    queryFn: () => {
      if (!schoolId) throw new Error("A valid school must be selected before loading academic context");
      return fetchAcademicContext({ data: { schoolId } });
    },
    enabled: Boolean(schoolId),
    staleTime: 60_000,
  });

  const academicYears = academicQuery.data?.academicYears ?? [];
  const terms = academicQuery.data?.terms ?? [];

  // Academic year must belong to the active school (rows are school-filtered).
  useEffect(() => {
    if (!academicQuery.data) return;
    const stored = academicYearId ?? readStored(STORAGE_KEYS.academicYear);
    const valid = academicYears.find((y) => y.id === stored);
    const next = valid?.id ?? academicYears.find((y) => y.isCurrent)?.id ?? academicYears[0]?.id ?? null;
    if (next !== academicYearId) {
      setAcademicYearId(next);
      writeStored(STORAGE_KEYS.academicYear, next);
    }
  }, [academicQuery.data, academicYears, academicYearId]);

  // Term must belong to the active academic year.
  useEffect(() => {
    if (!academicQuery.data) return;
    const scoped = terms.filter((t) => t.academicYearId === academicYearId);
    const stored = termId ?? readStored(STORAGE_KEYS.term);
    const valid = scoped.find((t) => t.id === stored);
    const next = valid?.id ?? scoped.find((t) => t.status === "active")?.id ?? scoped[0]?.id ?? null;
    if (next !== termId) {
      setTermId(next);
      writeStored(STORAGE_KEYS.term, next);
    }
  }, [academicQuery.data, terms, academicYearId, termId]);

  const permissions = activeOrganization?.permissions ?? [];

  const value: AppContextValue = {
    isLoading: sessionQuery.isLoading,
    error: ((sessionQuery.error ?? academicQuery.error) as Error | null) ?? null,
    refetch: () => void sessionQuery.refetch(),
    snapshot: sessionQuery.data,
    organizations,
    activeOrganization,
    activeSchool: activeOrganization?.schools.find((s) => s.id === schoolId) ?? null,
    academicYears,
    terms: terms.filter((t) => t.academicYearId === academicYearId),
    activeAcademicYear: academicYears.find((y) => y.id === academicYearId) ?? null,
    activeTerm: terms.find((t) => t.id === termId) ?? null,
    academicLoading: academicQuery.isLoading,
    permissions,
    hasPermission: (code: string) => permissions.includes(code),
    setOrganization: (id: string) => {
      if (!organizations.some((o) => o.organizationId === id)) return;
      setOrganizationId(id);
      writeStored(STORAGE_KEYS.organization, id);
      setSchoolId(null);
      writeStored(STORAGE_KEYS.school, null);
      setAcademicYearId(null);
      writeStored(STORAGE_KEYS.academicYear, null);
      setTermId(null);
      writeStored(STORAGE_KEYS.term, null);
    },
    setSchool: (id: string) => {
      if (!activeOrganization?.schools.some((s) => s.id === id)) return;
      setSchoolId(id);
      writeStored(STORAGE_KEYS.school, id);
      setAcademicYearId(null);
      writeStored(STORAGE_KEYS.academicYear, null);
      setTermId(null);
      writeStored(STORAGE_KEYS.term, null);
    },
    setAcademicYear: (id: string) => {
      if (!academicYears.some((y) => y.id === id)) return;
      setAcademicYearId(id);
      writeStored(STORAGE_KEYS.academicYear, id);
      setTermId(null);
      writeStored(STORAGE_KEYS.term, null);
    },
    setTerm: (id: string) => {
      if (!terms.some((t) => t.id === id && t.academicYearId === academicYearId)) return;
      setTermId(id);
      writeStored(STORAGE_KEYS.term, id);
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used inside AppContextProvider");
  return ctx;
}

export function PermissionGate({
  permission,
  anyOf,
  fallback = null,
  children,
}: {
  permission?: string;
  anyOf?: string[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { hasPermission } = useAppContext();
  const codes = anyOf ?? (permission ? [permission] : []);
  const allowed = codes.length === 0 || codes.some((code) => hasPermission(code));
  return <>{allowed ? children : fallback}</>;
}
