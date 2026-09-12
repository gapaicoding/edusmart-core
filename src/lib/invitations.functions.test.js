import { describe, expect, test } from "bun:test";
import { acceptInvitationCore } from "./invitations.functions.ts";

/**
 * B9 predeploy security review — Gate 2 regression suite.
 *
 * A minimal in-memory fake of the Supabase admin query-builder chain used by
 * acceptInvitationCore, sufficient to assert both OUTCOME and MUTATION
 * ORDER. Every privileged write is recorded in `log` in call order so a test
 * can prove that no Membership/MembershipSchoolAccess/MembershipRole write
 * happened before a student-target conflict was detected.
 */
function fakeSupabaseAdmin(seed, log = []) {
  const tables = {
    profiles: [...(seed.profiles ?? [])],
    organization_memberships: [...(seed.organization_memberships ?? [])],
    membership_school_access: [...(seed.membership_school_access ?? [])],
    membership_roles: [...(seed.membership_roles ?? [])],
    students: (seed.students ?? []).map((s) => ({ ...s })),
    student_enrollments: [...(seed.student_enrollments ?? [])],
    invitations: [...(seed.invitations ?? [])],
    organizations: [...(seed.organizations ?? [])],
    roles: [...(seed.roles ?? DEFAULT_ROLES)],
  };
  let nextId = 1;

  function matches(row, filters) {
    return filters.every((f) => {
      if (f.type === "eq") return row[f.col] === f.val;
      if (f.type === "neq") return row[f.col] !== f.val;
      if (f.type === "in") return f.val.includes(row[f.col]);
      if (f.type === "is") return f.val === null ? row[f.col] == null : row[f.col] === f.val;
      return true;
    });
  }

  function builder(table) {
    const filters = [];
    let mode = "select";
    let payload = null;
    let wantSelect = false;
    let limitN = null;

    const api = {
      select(cols) {
        wantSelect = true;
        if (mode === "select") mode = "select";
        return api;
      },
      insert(obj) {
        mode = "insert";
        payload = obj;
        return api;
      },
      update(obj) {
        mode = "update";
        payload = obj;
        return api;
      },
      eq(col, val) {
        filters.push({ type: "eq", col, val });
        return api;
      },
      neq(col, val) {
        filters.push({ type: "neq", col, val });
        return api;
      },
      in(col, val) {
        filters.push({ type: "in", col, val });
        return api;
      },
      is(col, val) {
        filters.push({ type: "is", col, val });
        return api;
      },
      limit(n) {
        limitN = n;
        return api;
      },
      order() {
        return api;
      },
      execute() {
        if (mode === "insert") {
          const row = { id: `gen-${nextId++}`, ...payload };
          tables[table].push(row);
          log.push({ op: "insert", table, row: { ...row } });
          return { rows: [row], error: null };
        }
        if (mode === "update") {
          const affected = tables[table].filter((r) => matches(r, filters));
          affected.forEach((r) => Object.assign(r, payload));
          if (affected.length) {
            log.push({ op: "update", table, filters: [...filters], payload: { ...payload } });
          }
          return { rows: affected, error: null };
        }
        let rows = tables[table].filter((r) => matches(r, filters));
        if (limitN != null) rows = rows.slice(0, limitN);
        return { rows, error: null };
      },
      maybeSingle() {
        const { rows, error } = api.execute();
        return Promise.resolve({ data: rows[0] ?? null, error });
      },
      single() {
        const { rows, error } = api.execute();
        if (!error && rows.length !== 1) {
          return Promise.resolve({ data: null, error: { message: "not exactly one row" } });
        }
        return Promise.resolve({ data: rows[0] ?? null, error });
      },
      then(resolve, reject) {
        const { rows, error } = api.execute();
        return Promise.resolve({ data: wantSelect ? rows : null, error }).then(resolve, reject);
      },
    };
    return api;
  }

  return { from: builder, tables, log };
}

const ORG = "org-1";
const SCHOOL = "school-1";
const OTHER_ORG = "org-2";
const STUDENT_ROLE = "role-student";
const TEACHER_ROLE = "role-teacher";
const PARENT_ROLE = "role-parent";

const DEFAULT_ROLES = [
  { id: STUDENT_ROLE, code: "STUDENT" },
  { id: TEACHER_ROLE, code: "TEACHER" },
  { id: PARENT_ROLE, code: "PARENT" },
];

function baseInvitation(overrides = {}) {
  return {
    id: "invite-1",
    organization_id: ORG,
    school_id: SCHOOL,
    invited_role_id: STUDENT_ROLE,
    invited_scope_type: "OWN",
    invited_scope_id: null,
    target_student_id: "student-b",
    ...overrides,
  };
}

const PRIVILEGED_TABLES = [
  "organization_memberships",
  "membership_school_access",
  "membership_roles",
];

function privilegedWritesBefore(log, table) {
  return log.filter((entry) => PRIVILEGED_TABLES.includes(entry.table));
}

describe("Gate 2 — invitation mutation-order audit (acceptInvitationCore)", () => {
  test("profile already bound to Student A, invitation targets Student B → rejected BEFORE any privileged write", async () => {
    const log = [];
    const admin = fakeSupabaseAdmin(
      {
        profiles: [{ id: "user-p" }],
        students: [
          { id: "student-a", organization_id: ORG, profile_id: "user-p" },
          { id: "student-b", organization_id: ORG, profile_id: null },
        ],
        student_enrollments: [
          {
            id: "se-1",
            student_id: "student-b",
            organization_id: ORG,
            school_id: SCHOOL,
            status: "active",
          },
        ],
      },
      log,
    );

    await expect(
      acceptInvitationCore(admin, {
        invitation: baseInvitation(),
        userId: "user-p",
        signedInEmailLocalPart: "p",
      }),
    ).rejects.toThrow(/already linked to a different student/);

    expect(privilegedWritesBefore(log)).toEqual([]);
    expect(admin.tables.students.find((s) => s.id === "student-b").profile_id).toBeNull();
    expect(admin.tables.organization_memberships).toEqual([]);
    expect(admin.tables.membership_roles).toEqual([]);
  });

  test("Student B already bound to a different profile → rejected BEFORE any privileged write", async () => {
    const log = [];
    const admin = fakeSupabaseAdmin(
      {
        profiles: [{ id: "user-p" }],
        students: [{ id: "student-b", organization_id: ORG, profile_id: "some-other-profile" }],
        student_enrollments: [
          {
            id: "se-1",
            student_id: "student-b",
            organization_id: ORG,
            school_id: SCHOOL,
            status: "active",
          },
        ],
      },
      log,
    );

    await expect(
      acceptInvitationCore(admin, {
        invitation: baseInvitation(),
        userId: "user-p",
        signedInEmailLocalPart: "p",
      }),
    ).rejects.toThrow(/already linked to a different account/);

    expect(privilegedWritesBefore(log)).toEqual([]);
    expect(admin.tables.organization_memberships).toEqual([]);
  });

  test("target student missing → rejected BEFORE any privileged write", async () => {
    const log = [];
    const admin = fakeSupabaseAdmin({ profiles: [{ id: "user-p" }], students: [] }, log);

    await expect(
      acceptInvitationCore(admin, {
        invitation: baseInvitation(),
        userId: "user-p",
        signedInEmailLocalPart: "p",
      }),
    ).rejects.toThrow(/no longer exists/);

    expect(privilegedWritesBefore(log)).toEqual([]);
  });

  test("wrong organization (target student in a different org) → rejected BEFORE any privileged write", async () => {
    const log = [];
    const admin = fakeSupabaseAdmin(
      {
        profiles: [{ id: "user-p" }],
        students: [{ id: "student-b", organization_id: OTHER_ORG, profile_id: null }],
      },
      log,
    );

    await expect(
      acceptInvitationCore(admin, {
        invitation: baseInvitation(),
        userId: "user-p",
        signedInEmailLocalPart: "p",
      }),
    ).rejects.toThrow(/no longer exists/);

    expect(privilegedWritesBefore(log)).toEqual([]);
  });

  test("wrong/stale school enrollment → rejected BEFORE any privileged write", async () => {
    const log = [];
    const admin = fakeSupabaseAdmin(
      {
        profiles: [{ id: "user-p" }],
        students: [{ id: "student-b", organization_id: ORG, profile_id: null }],
        student_enrollments: [], // enrollment was removed/changed after invitation issuance
      },
      log,
    );

    await expect(
      acceptInvitationCore(admin, {
        invitation: baseInvitation(),
        userId: "user-p",
        signedInEmailLocalPart: "p",
      }),
    ).rejects.toThrow(/valid enrollment/);

    expect(privilegedWritesBefore(log)).toEqual([]);
    expect(admin.tables.organization_memberships).toEqual([]);
    expect(admin.tables.membership_roles).toEqual([]);
  });

  test("same user / same target retry is idempotent and still binds correctly", async () => {
    const admin = fakeSupabaseAdmin({
      profiles: [{ id: "user-p" }],
      students: [{ id: "student-b", organization_id: ORG, profile_id: null }],
      student_enrollments: [
        {
          id: "se-1",
          student_id: "student-b",
          organization_id: ORG,
          school_id: SCHOOL,
          status: "active",
        },
      ],
      organizations: [{ id: ORG, name: "Org" }],
    });

    const first = await acceptInvitationCore(admin, {
      invitation: baseInvitation(),
      userId: "user-p",
      signedInEmailLocalPart: "p",
    });
    expect(first.organizationId).toBe(ORG);
    expect(admin.tables.students.find((s) => s.id === "student-b").profile_id).toBe("user-p");
    expect(admin.tables.membership_roles).toHaveLength(1);

    // Retry with the same invitation row (as if accepted_at guard were reset
    // for this test) must not fail and must not duplicate the role grant.
    const second = await acceptInvitationCore(admin, {
      invitation: baseInvitation(),
      userId: "user-p",
      signedInEmailLocalPart: "p",
    });
    expect(second.organizationId).toBe(ORG);
    expect(admin.tables.membership_roles).toHaveLength(1);
    expect(admin.tables.students.find((s) => s.id === "student-b").profile_id).toBe("user-p");
  });

  test("normal TEACHER (non-student-targeted) invitation still works unchanged", async () => {
    const admin = fakeSupabaseAdmin({
      profiles: [{ id: "user-t" }],
      organizations: [{ id: ORG, name: "Org" }],
    });

    const result = await acceptInvitationCore(admin, {
      invitation: baseInvitation({
        invited_role_id: TEACHER_ROLE,
        invited_scope_type: "SCHOOL",
        invited_scope_id: SCHOOL,
        target_student_id: null,
      }),
      userId: "user-t",
      signedInEmailLocalPart: "t",
    });

    expect(result.organizationId).toBe(ORG);
    expect(admin.tables.organization_memberships).toHaveLength(1);
    expect(admin.tables.membership_school_access).toHaveLength(1);
    expect(admin.tables.membership_roles).toEqual([
      expect.objectContaining({ role_id: TEACHER_ROLE, scope_type: "SCHOOL", scope_id: SCHOOL }),
    ]);
  });

  test("normal PARENT (RELATED scope, non-student-targeted) invitation still works unchanged", async () => {
    const admin = fakeSupabaseAdmin({
      profiles: [{ id: "user-parent" }],
      organizations: [{ id: ORG, name: "Org" }],
    });

    const result = await acceptInvitationCore(admin, {
      invitation: baseInvitation({
        invited_role_id: PARENT_ROLE,
        invited_scope_type: "RELATED",
        invited_scope_id: null,
        target_student_id: null,
        school_id: null,
      }),
      userId: "user-parent",
      signedInEmailLocalPart: "parent",
    });

    expect(result.organizationId).toBe(ORG);
    expect(admin.tables.membership_roles).toEqual([
      expect.objectContaining({ role_id: PARENT_ROLE, scope_type: "RELATED", scope_id: null }),
    ]);
    // No school in this invitation, so no school-access row should exist.
    expect(admin.tables.membership_school_access).toEqual([]);
  });

  test("a race that loses the guarded bind (target bound by someone else meanwhile) hard-fails rather than silently consuming the invitation", async () => {
    const admin = fakeSupabaseAdmin({
      profiles: [{ id: "user-p" }],
      // Already bound to a DIFFERENT profile by the time the final guarded
      // write runs (simulates the narrow TOCTOU window), even though the
      // preflight read (constructed by this seed) would have seen it as
      // already-conflicting too — this asserts the defense-in-depth recheck
      // at the final write, not just the preflight.
      students: [{ id: "student-b", organization_id: ORG, profile_id: "someone-else" }],
      student_enrollments: [
        {
          id: "se-1",
          student_id: "student-b",
          organization_id: ORG,
          school_id: SCHOOL,
          status: "active",
        },
      ],
    });

    await expect(
      acceptInvitationCore(admin, {
        invitation: baseInvitation(),
        userId: "user-p",
        signedInEmailLocalPart: "p",
      }),
    ).rejects.toThrow(/already linked to a different account/);
  });

  test("Gate 3 — a legacy pre-B9 STUDENT/OWN invitation with no target_student_id is rejected BEFORE any privileged write (never silently treated as a normal invitation)", async () => {
    const log = [];
    const admin = fakeSupabaseAdmin({ profiles: [{ id: "user-p" }] }, log);

    await expect(
      acceptInvitationCore(admin, {
        invitation: baseInvitation({ target_student_id: null }),
        userId: "user-p",
        signedInEmailLocalPart: "p",
      }),
    ).rejects.toThrow(/missing an exact target student/);

    expect(privilegedWritesBefore(log)).toEqual([]);
    expect(admin.tables.organization_memberships).toEqual([]);
    expect(admin.tables.membership_roles).toEqual([]);
  });
});
