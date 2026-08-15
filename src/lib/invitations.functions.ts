import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { hashInvitationToken, generateInvitationToken, normalizeEmail } = await import(
      "./invitations.server"
    );

    // Authority check runs as the caller, so RLS/RBAC decides.
    const { data: allowed, error: permError } = await supabase.rpc("has_permission", {
      p_permission_code: "membership.invite",
      p_organization_id: data.organizationId,
      ...(data.schoolId ? { p_school_id: data.schoolId } : {}),
    });
    if (permError) throw new Error(permError.message);
    if (!allowed) throw new Error("Forbidden: membership.invite is required");

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

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => {
    if (!input?.token || typeof input.token !== "string") throw new Error("Invitation token is required");
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
        "id, organization_id, school_id, email, invited_role_id, invited_scope_type, invited_scope_id, expires_at, accepted_at, revoked_at",
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

    // Ensure a business profile exists for the auth user.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .insert({ id: userId, full_name: signedInEmail.split("@")[0] ?? "New user", status: "ACTIVE" });
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
        .update({ status: "ACTIVE", ended_at: null })
        .eq("id", membershipId);
      if (updateError) throw new Error(updateError.message);
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("organization_memberships")
        .insert({
          organization_id: invitation.organization_id,
          profile_id: userId,
          status: "ACTIVE",
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
          .update({ status: "ACTIVE" })
          .eq("id", access.id);
      } else {
        const { error: accessError } = await supabaseAdmin.from("membership_school_access").insert({
          organization_id: invitation.organization_id,
          membership_id: membershipId,
          school_id: invitation.school_id,
          status: "ACTIVE",
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
  });
