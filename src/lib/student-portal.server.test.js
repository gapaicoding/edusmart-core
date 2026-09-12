import { describe, expect, test } from "bun:test";

import {
  callStudentPublishedScheduleRpc,
  callStudentOwnAttendanceRpc,
  getAuthenticatedStudentSubject,
} from "./student-portal.server.ts";

/**
 * Minimal fake Supabase query builder covering the exact chain shapes used
 * by getAuthenticatedStudentSubject: .from(table).select(...).eq(...).eq(...)
 * [.in(...)] [.limit(...)] .maybeSingle().
 */
function fakeSupabase(responses) {
  // responses: { students: {data, error}, student_enrollments: {data, error} }
  return {
    from(table) {
      const state = { table };
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        limit: () => builder,
        maybeSingle: async () => responses[state.table] ?? { data: null, error: null },
      };
      return builder;
    },
  };
}

describe("getAuthenticatedStudentSubject — exact profile binding", () => {
  test("exact profile resolves exact student", async () => {
    const supabase = fakeSupabase({
      students: {
        data: {
          id: "student-a",
          organization_id: "org-a",
          full_name: "Student A",
          status: "active",
        },
        error: null,
      },
    });
    const subject = await getAuthenticatedStudentSubject(supabase, "user-a", {
      organizationId: "org-a",
    });
    expect(subject).toEqual({
      studentId: "student-a",
      organizationId: "org-a",
      fullName: "Student A",
      status: "active",
    });
  });

  test("no bound student produces a safe null state (never a fallback match)", async () => {
    const supabase = fakeSupabase({ students: { data: null, error: null } });
    const subject = await getAuthenticatedStudentSubject(supabase, "user-x", {
      organizationId: "org-a",
    });
    expect(subject).toBeNull();
  });

  test("archived student is treated as unbound", async () => {
    const supabase = fakeSupabase({
      students: {
        data: {
          id: "student-a",
          organization_id: "org-a",
          full_name: "Student A",
          status: "archived",
        },
        error: null,
      },
    });
    const subject = await getAuthenticatedStudentSubject(supabase, "user-a", {
      organizationId: "org-a",
    });
    expect(subject).toBeNull();
  });

  test("a school filter without a valid enrollment denies access (unrelated student boundary)", async () => {
    const supabase = fakeSupabase({
      students: {
        data: {
          id: "student-a",
          organization_id: "org-a",
          full_name: "Student A",
          status: "active",
        },
        error: null,
      },
      student_enrollments: { data: null, error: null },
    });
    const subject = await getAuthenticatedStudentSubject(supabase, "user-a", {
      organizationId: "org-a",
      schoolId: "school-b",
    });
    expect(subject).toBeNull();
  });

  test("a school filter with a valid enrollment resolves the student", async () => {
    const supabase = fakeSupabase({
      students: {
        data: {
          id: "student-a",
          organization_id: "org-a",
          full_name: "Student A",
          status: "active",
        },
        error: null,
      },
      student_enrollments: { data: { id: "enrollment-a" }, error: null },
    });
    const subject = await getAuthenticatedStudentSubject(supabase, "user-a", {
      organizationId: "org-a",
      schoolId: "school-a",
    });
    expect(subject?.studentId).toBe("student-a");
  });

  test("surfaces a translated error instead of throwing raw Postgrest details", async () => {
    const supabase = fakeSupabase({
      students: { data: null, error: { code: "42501", message: "denied" } },
    });
    await expect(
      getAuthenticatedStudentSubject(supabase, "user-a", { organizationId: "org-a" }),
    ).rejects.toThrow(/does not have access/);
  });
});

describe("Student published schedule RPC — safe projection only", () => {
  test("derives the Student server-side and accepts only organization context", async () => {
    const calls = [];
    const client = {
      async rpc(fn, args) {
        calls.push({ fn, args });
        return { data: [], error: null };
      },
    };
    await callStudentPublishedScheduleRpc(client, "org-a");
    expect(calls).toEqual([
      {
        fn: "list_student_published_schedule",
        args: { p_organization_id: "org-a" },
      },
    ]);
    expect(calls[0].args).not.toHaveProperty("p_student_id");
    expect(calls[0].args).not.toHaveProperty("p_staff_member_id");
  });
});

describe("Student OWN attendance RPC — never accepts a client-supplied student id", () => {
  test("calls the canonical B9 RPC name and forwards only organization/school/date args", async () => {
    const seenArgs = [];
    const client = {
      async rpc(fn, args) {
        seenArgs.push({ fn, args });
        return { data: [], error: null };
      },
    };
    await callStudentOwnAttendanceRpc(client, {
      p_organization_id: "org-a",
      p_school_id: "school-a",
      p_from: "2026-01-01",
      p_to: "2026-01-31",
    });
    expect(seenArgs).toHaveLength(1);
    expect(seenArgs[0].fn).toBe("list_student_own_attendance");
    expect(seenArgs[0].args).not.toHaveProperty("p_student_id");
    expect(seenArgs[0].args.p_organization_id).toBe("org-a");
    expect(seenArgs[0].args.p_school_id).toBe("school-a");
  });
});
