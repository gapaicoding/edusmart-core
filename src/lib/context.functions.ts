import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Batch 0 context + permission snapshot.
 *
 * Every query runs through `context.supabase`, which is built from the caller's
 * access token, so `auth.uid()` is real and RLS stays authoritative.
 * No service-role credential is used in this file.
 */

export type RoleGrant = {
  code: string;
  name: string;
  scopeType: string;
  scopeId: string | null;
};

export type SchoolSummary = { id: string; code: string; name: string };

export type OrganizationContext = {
  organizationId: string;
  membershipId: string;
  name: string;
  code: string | null;
  roles: RoleGrant[];
  permissions: string[];
  schools: SchoolSummary[];
};

export type SessionContext = {
  profile: { id: string; fullName: string; status: string } | null;
  organizations: OrganizationContext[];
};

export const getSessionContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SessionContext> => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, status")
      .eq("id", userId)
      .maybeSingle();

    const profileDto = profile
      ? { id: profile.id, fullName: profile.full_name, status: profile.status }
      : null;

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("id, organization_id, status")
      .eq("profile_id", userId);

    if (membershipError) throw new Error(membershipError.message);

    const active = (memberships ?? []).filter((m) => m.status === "ACTIVE");
    if (active.length === 0) return { profile: profileDto, organizations: [] };

    const membershipIds = active.map((m) => m.id);
    const orgIds = Array.from(new Set(active.map((m) => m.organization_id)));

    const [orgsRes, accessRes, grantsRes] = await Promise.all([
      supabase.from("organizations").select("id, code, name").in("id", orgIds),
      supabase
        .from("membership_school_access")
        .select("membership_id, school_id, status")
        .in("membership_id", membershipIds),
      supabase
        .from("membership_roles")
        .select("membership_id, role_id, scope_type, scope_id, ends_at")
        .in("membership_id", membershipIds),
    ]);

    const activeAccess = (accessRes.data ?? []).filter((a) => a.status === "ACTIVE");
    const schoolIds = Array.from(new Set(activeAccess.map((a) => a.school_id)));

    const activeGrants = (grantsRes.data ?? []).filter(
      (g) => !g.ends_at || new Date(g.ends_at).getTime() > Date.now(),
    );
    const roleIds = Array.from(new Set(activeGrants.map((g) => g.role_id)));

    const schoolsRes = schoolIds.length
      ? await supabase.from("schools").select("id, organization_id, code, name").in("id", schoolIds)
      : { data: [] };
    const rolesRes = roleIds.length
      ? await supabase.from("roles").select("id, code, name").in("id", roleIds)
      : { data: [] };
    const rolePermsRes = roleIds.length
      ? await supabase.from("role_permissions").select("role_id, permissions(code)").in("role_id", roleIds)
      : { data: [] };

    const roleById = new Map(
      ((rolesRes.data ?? []) as { id: string; code: string; name: string }[]).map((r) => [r.id, r]),
    );

    const permsByRole = new Map<string, string[]>();
    for (const row of (rolePermsRes.data ?? []) as {
      role_id: string;
      permissions: { code: string } | { code: string }[] | null;
    }[]) {
      const perm = Array.isArray(row.permissions) ? row.permissions[0] : row.permissions;
      if (!perm) continue;
      permsByRole.set(row.role_id, [...(permsByRole.get(row.role_id) ?? []), perm.code]);
    }

    const schoolRows = (schoolsRes.data ?? []) as {
      id: string;
      organization_id: string;
      code: string;
      name: string;
    }[];

    const organizations: OrganizationContext[] = active.map((membership) => {
      const org = ((orgsRes.data ?? []) as { id: string; code: string; name: string }[]).find(
        (o) => o.id === membership.organization_id,
      );
      const grants = activeGrants.filter((g) => g.membership_id === membership.id);

      const roles: RoleGrant[] = grants.map((g) => {
        const role = roleById.get(g.role_id);
        return {
          code: role?.code ?? "UNKNOWN",
          name: role?.name ?? "Unknown role",
          scopeType: g.scope_type,
          scopeId: g.scope_id,
        };
      });

      const permissions = Array.from(
        new Set(grants.flatMap((g) => permsByRole.get(g.role_id) ?? [])),
      ).sort();

      const accessible = new Set(
        activeAccess.filter((a) => a.membership_id === membership.id).map((a) => a.school_id),
      );

      return {
        organizationId: membership.organization_id,
        membershipId: membership.id,
        name: org?.name ?? "Organization",
        code: org?.code ?? null,
        roles,
        permissions,
        schools: schoolRows
          .filter((s) => accessible.has(s.id))
          .map((s) => ({ id: s.id, code: s.code, name: s.name })),
      };
    });

    return { profile: profileDto, organizations };
  });

export type AcademicYearSummary = {
  id: string;
  code: string;
  name: string;
  status: string;
  isCurrent: boolean;
  startsOn: string;
  endsOn: string;
};

export type TermSummary = {
  id: string;
  academicYearId: string;
  code: string;
  name: string;
  status: string;
  sequence: number;
};

export type AcademicContext = {
  academicYears: AcademicYearSummary[];
  terms: TermSummary[];
};

export const getAcademicContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { schoolId: string }) => {
    if (!input?.schoolId || typeof input.schoolId !== "string") {
      throw new Error("schoolId is required");
    }
    return { schoolId: input.schoolId };
  })
  .handler(async ({ data, context }): Promise<AcademicContext> => {
    const { supabase } = context;

    // RLS (`academic_year.read` / `term.read` at the correct scope) is the
    // authority: an inaccessible school id simply returns no rows.
    const { data: years, error } = await supabase
      .from("academic_years")
      .select("id, code, name, status, is_current, starts_on, ends_on")
      .eq("school_id", data.schoolId)
      .order("starts_on", { ascending: false });

    if (error) throw new Error(error.message);

    const yearIds = (years ?? []).map((y) => y.id);
    const termsRes = yearIds.length
      ? await supabase
          .from("terms")
          .select("id, academic_year_id, code, name, status, sequence")
          .in("academic_year_id", yearIds)
          .order("sequence", { ascending: true })
      : { data: [] };

    return {
      academicYears: (years ?? []).map((y) => ({
        id: y.id,
        code: y.code,
        name: y.name,
        status: y.status,
        isCurrent: y.is_current,
        startsOn: y.starts_on,
        endsOn: y.ends_on,
      })),
      terms: (
        (termsRes.data ?? []) as {
          id: string;
          academic_year_id: string;
          code: string;
          name: string;
          status: string;
          sequence: number;
        }[]
      ).map((t) => ({
        id: t.id,
        academicYearId: t.academic_year_id,
        code: t.code,
        name: t.name,
        status: t.status,
        sequence: t.sequence,
      })),
    };
  });
