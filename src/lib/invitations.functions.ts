import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emailSchema } from "@/lib/email";

/**
 * Narrow structural type for the admin client accepted by
 * acceptInvitationCore. The real `supabaseAdmin` (SupabaseClient<Database>)
 * satisfies this structurally; tests substitute an in-memory fake that
 * implements the same `.from(table)` query-builder chain shape so the
 * privileged-write ORDER can be asserted without a live database.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminLike = { from: (table: string) => any };

/**
 * Invitation flow (Batch 0).
 *
 * - Issuance is privileged: the inviter's `membership.invite` permission is
 *   checked with the caller's own token (RLS-backed `has_permission`) BEFORE
 *   any privileged write happens.
 * - Acceptance only requires a signed-in recipient — never an existing
 *   membership permission. Token hash, intended email, expiry and status are
 *   all validated server-side before membership activation.
 * - The browser never activates a membership itself.
 */

export type CreateInvitationInput = {
  email: string;
  organizationId: string;
  roleId: string;
  scopeType: "ORG" | "SCHOOL" | "CLASS" | "OWN" | "RELATED";
  scopeId?: string | null;
  schoolId?: string | null;
  expiresInDays?: number;
};

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateInvitationInput) => {
    const email = emailSchema.parse(input?.email ?? "");
    if (!input.organizationId) throw new Error("organizationId is required");
    if (!input.roleId) throw new Error("roleId is required");
    if (!input.scopeType) throw new Error("scopeType is required");
    return { ...input, email };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { hashInvitationToken, generateInvitationToken, normalizeEmail } =
      await import("./invitations.server");

    // Authority check runs as the caller, so RLS/RBAC decides.
    const { data: allowed, error: permError } = await supabase.rpc("has_permission", {
      p_permission_code: "membership.invite",
      p_organization_id: data.organizationId,
      ...(data.schoolId ? { p_school_id: data.schoolId } : {}),
    });
    if (permError) throw new Error(permError.message);
    if (!allowed) throw new Error("Forbidden: membership.invite is required");

    // B9: the generic invitation flow can no longer create a STUDENT/OWN
    // invitation — it does not bind students.profile_id. Route callers to
    // the dedicated Student Portal invitation workflow instead, which
    // verifies and carries an exact target student. This mirrors (and backs
    // up) the DB-enforced invariant in trg_validate_student_invitation.
    if (data.scopeType === "OWN") {
      const { data: role, error: roleErr } = await supabase
        .from("roles")
        .select("code")
        .eq("id", data.roleId)
        .maybeSingle();
      if (roleErr) throw new Error(roleErr.message);
      if (role?.code === "STUDENT") {
        throw new Error(
          "A STUDENT invitation requires an exact target student. Use the Student Portal invitation workflow (Student Account Access on the student's profile) instead of the generic invitation flow.",
        );
      }
    }

    const token = generateInvitationToken();
    const tokenHash = await hashInvitationToken(token);
    const expiresAt = new Date(
      Date.now() + (data.expiresInDays ?? 7) * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("invitations").insert({
      organization_id: data.organizationId,
      school_id: data.schoolId ?? null,
      email: normalizeEmail(data.email),
      invited_role_id: data.roleId,
      invited_scope_type: data.scopeType,
      invited_scope_id: data.scopeId ?? null,
      token_hash: tokenHash,
      expires_at: expiresAt,
      invited_by_profile_id: userId,
    });
    if (error) throw new Error(error.message);

    return { token, expiresAt };
  });

export type AcceptInvitationResult = {
  organizationId: string;
  organizationName: string | null;
};

export type AcceptableInvitation = {
  id: string;
  organization_id: string;
  school_id: string | null;
  invited_role_id: string;
  invited_scope_type: string;
  invited_scope_id: string | null;
  target_student_id: string | null;
};

/**
 * acceptInvitationCore
 *
 * The privileged-mutation portion of invitation acceptance, factored out of
 * the createServerFn handler below so its mutation ORDER is directly
 * testable without an HTTP round trip or a live database (see
 * invitations.functions.test.js for the Gate 2 regression suite this
 * exists for). Token/email/expiry/revocation validation stays in the
 * handler — by the time this runs, the caller is already proven to be the
 * legitimate recipient of `invitation`.
 *
 * Ordering invariant (see B9 predeploy security review, Gate 2): every
 * student-target/binding/enrollment conflict is proven with read-only
 * queries BEFORE any privileged write (Profile, OrganizationMembership,
 * MembershipSchoolAccess, MembershipRole). A rejected student-targeted
 * invitation must never leave behind a partially-provisioned STUDENT/OWN
 * grant.
 */
export async function acceptInvitationCore(
  supabaseAdmin: SupabaseAdminLike,
  params: { invitation: AcceptableInvitation; userId: string; signedInEmailLocalPart: string },
): Promise<AcceptInvitationResult> {
  const { invitation, userId, signedInEmailLocalPart } = params;

  // B9: reject a legacy pre-B9 STUDENT/OWN invitation that has no
  // target_student_id, BEFORE any privileged write. Without this explicit
  // check, `invitation.target_student_id` being falsy would make this
  // function treat such a row exactly like a normal (non-student-targeted)
  // invitation — granting a STUDENT/OWN MembershipRole with no student ever
  // bound — and it would only fail later at the final "mark consumed"
  // update (blocked by the DB trigger), after every privileged grant had
  // already been committed. This mirrors trg_validate_student_invitation's
  // "must carry an exact target" invariant at the application layer too.
  {
    const { data: role, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("code")
      .eq("id", invitation.invited_role_id)
      .maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (
      role?.code === "STUDENT" &&
      invitation.invited_scope_type === "OWN" &&
      !invitation.target_student_id
    ) {
      throw new Error(
        "This invitation is missing an exact target student and cannot be accepted. Ask the school to reissue it through the Student Portal invitation workflow.",
      );
    }
  }

  // B9: preflight every student-target/binding invariant using trusted
  // reads BEFORE any privileged write (Profile/Membership/SchoolAccess/
  // Role). This is deliberate ordering: a rejected student-targeted
  // invitation must never leave behind a Profile, an active/reactivated
  // Membership, a MembershipSchoolAccess row, or a STUDENT/OWN
  // MembershipRole grant. All conflict/target/enrollment checks below are
  // read-only and immutable at this point in the flow — the actual
  // students.profile_id write happens later, only after every privileged
  // grant it depends on has already been safely established.
  let targetStudentId: string | null = null;
  if (invitation.target_student_id) {
    const { data: targetStudent, error: targetError } = await supabaseAdmin
      .from("students")
      .select("id, profile_id")
      .eq("id", invitation.target_student_id)
      .eq("organization_id", invitation.organization_id)
      .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!targetStudent) throw new Error("The invited student record no longer exists.");

    if (targetStudent.profile_id && targetStudent.profile_id !== userId) {
      throw new Error("This invitation's student record is already linked to a different account.");
    }

    if (!targetStudent.profile_id) {
      const { data: existingBinding, error: bindingCheckError } = await supabaseAdmin
        .from("students")
        .select("id")
        .eq("profile_id", userId)
        .eq("organization_id", invitation.organization_id)
        .neq("id", targetStudent.id)
        .maybeSingle();
      if (bindingCheckError) throw new Error(bindingCheckError.message);
      if (existingBinding) {
        throw new Error(
          "This account is already linked to a different student in this organization.",
        );
      }
    }

    // Enrollment can change between invitation issuance and acceptance
    // (the DB trigger only validates it at invitation insert/update time).
    // Re-verify it here, before any privileged write, rather than trusting
    // a possibly stale state from issuance time.
    if (invitation.school_id) {
      const { data: enrollment, error: enrollError } = await supabaseAdmin
        .from("student_enrollments")
        .select("id")
        .eq("student_id", targetStudent.id)
        .eq("organization_id", invitation.organization_id)
        .eq("school_id", invitation.school_id)
        .in("status", ["active", "leave"])
        .limit(1)
        .maybeSingle();
      if (enrollError) throw new Error(enrollError.message);
      if (!enrollment) {
        throw new Error(
          "The invited student no longer has a valid enrollment in this invitation's school.",
        );
      }
    }

    targetStudentId = targetStudent.id;
  }

  // Ensure a business profile exists for the auth user.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) {
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({ id: userId, full_name: signedInEmailLocalPart || "New user", status: "active" });
    if (profileError) throw new Error(profileError.message);
  }

  // Membership (create or reactivate).
  const { data: existing } = await supabaseAdmin
    .from("organization_memberships")
    .select("id, status")
    .eq("organization_id", invitation.organization_id)
    .eq("profile_id", userId)
    .maybeSingle();

  let membershipId = existing?.id ?? null;
  if (membershipId) {
    const { error: updateError } = await supabaseAdmin
      .from("organization_memberships")
      .update({ status: "active", ended_at: null })
      .eq("id", membershipId);
    if (updateError) throw new Error(updateError.message);
  } else {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("organization_memberships")
      .insert({
        organization_id: invitation.organization_id,
        profile_id: userId,
        status: "active",
        joined_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    membershipId = inserted.id;
  }

  // School access must exist before a SCHOOL/CLASS scoped role grant.
  if (invitation.school_id) {
    const { data: access } = await supabaseAdmin
      .from("membership_school_access")
      .select("id")
      .eq("membership_id", membershipId)
      .eq("school_id", invitation.school_id)
      .maybeSingle();

    if (access) {
      await supabaseAdmin
        .from("membership_school_access")
        .update({ status: "active" })
        .eq("id", access.id);
    } else {
      const { error: accessError } = await supabaseAdmin.from("membership_school_access").insert({
        organization_id: invitation.organization_id,
        membership_id: membershipId,
        school_id: invitation.school_id,
        status: "active",
      });
      if (accessError) throw new Error(accessError.message);
    }
  }

  // Role grant (idempotent).
  const roleQuery = supabaseAdmin
    .from("membership_roles")
    .select("id")
    .eq("membership_id", membershipId)
    .eq("role_id", invitation.invited_role_id)
    .eq("scope_type", invitation.invited_scope_type);

  const { data: existingRole } = invitation.invited_scope_id
    ? await roleQuery.eq("scope_id", invitation.invited_scope_id).maybeSingle()
    : await roleQuery.is("scope_id", null).maybeSingle();

  if (!existingRole) {
    const { error: roleError } = await supabaseAdmin.from("membership_roles").insert({
      organization_id: invitation.organization_id,
      membership_id: membershipId,
      role_id: invitation.invited_role_id,
      scope_type: invitation.invited_scope_type,
      scope_id: invitation.invited_scope_id,
    });
    if (roleError) throw new Error(roleError.message);
  }

  // B9: bind the exact target student to this profile. Every conflict was
  // already proven above, before Profile/OrganizationMembership/
  // MembershipSchoolAccess/MembershipRole were touched. This write is
  // narrowly guarded (.is("profile_id", null)) against a same-target
  // concurrent-acceptance race; if that guard causes zero rows to be
  // affected, re-read to distinguish "someone else already completed this
  // exact idempotent bind" (safe) from a genuine race loss (hard fail),
  // rather than silently marking the invitation accepted either way.
  if (targetStudentId) {
    const { data: bound, error: bindError } = await supabaseAdmin
      .from("students")
      .update({ profile_id: userId })
      .eq("id", targetStudentId)
      .eq("organization_id", invitation.organization_id)
      .is("profile_id", null)
      .select("id");
    if (bindError) throw new Error(bindError.message);

    if (!bound || bound.length === 0) {
      const { data: current, error: currentError } = await supabaseAdmin
        .from("students")
        .select("profile_id")
        .eq("id", targetStudentId)
        .eq("organization_id", invitation.organization_id)
        .maybeSingle();
      if (currentError) throw new Error(currentError.message);
      if (current?.profile_id !== userId) {
        throw new Error(
          "This invitation's student binding changed while it was being accepted. Ask the school to reissue the invitation.",
        );
      }
      // else: current.profile_id === userId — already bound (idempotent
      // retry, or a concurrent request from this same profile won the
      // race), so the invitation is safe to consume below.
    }
  }

  // Single-use: mark consumed.
  const { error: consumeError } = await supabaseAdmin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id)
    .is("accepted_at", null);
  if (consumeError) throw new Error(consumeError.message);

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("name")
    .eq("id", invitation.organization_id)
    .maybeSingle();

  return {
    organizationId: invitation.organization_id,
    organizationName: org?.name ?? null,
  };
}

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => {
    if (!input?.token || typeof input.token !== "string")
      throw new Error("Invitation token is required");
    return { token: input.token };
  })
  .handler(async ({ data, context }): Promise<AcceptInvitationResult> => {
    const { userId, claims } = context;
    const { hashInvitationToken, normalizeEmail } = await import("./invitations.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tokenHash = await hashInvitationToken(data.token);

    const { data: invitation, error } = await supabaseAdmin
      .from("invitations")
      .select(
        "id, organization_id, school_id, email, invited_role_id, invited_scope_type, invited_scope_id, target_student_id, expires_at, accepted_at, revoked_at",
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!invitation) throw new Error("This invitation link is not valid.");
    if (invitation.revoked_at) throw new Error("This invitation has been revoked.");
    if (invitation.accepted_at) throw new Error("This invitation has already been used.");
    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      throw new Error("This invitation has expired.");
    }

    const signedInEmail = normalizeEmail(String((claims as { email?: string }).email ?? ""));
    if (!signedInEmail || signedInEmail !== normalizeEmail(invitation.email)) {
      throw new Error(
        `This invitation was issued to ${invitation.email}. Sign in with that email to accept it.`,
      );
    }

    return acceptInvitationCore(supabaseAdmin, {
      invitation,
      userId,
      signedInEmailLocalPart: signedInEmail.split("@")[0] ?? "",
    });
  });
