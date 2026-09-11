import { describe, expect, test } from "bun:test";

import {
  callParentAttendanceRpc,
  filterCanonicalPortalRelationships,
  filterCurrentPublishedPortalReports,
} from "./portal.server.ts";

const linked = {
  guardian_id: "guardian-a",
  student_id: "child-a",
  organization_id: "org-a",
  relationship_type: "guardian",
  is_primary: true,
  can_view_academic: true,
  can_view_attendance: true,
  status: "active",
  students: { id: "child-a", full_name: "Child A", status: "active" },
};

const unrelated = {
  ...linked,
  guardian_id: "guardian-b",
  student_id: "child-b",
  relationship_type: "father",
  students: { id: "child-b", full_name: "Child B", status: "active" },
};

describe("canonical Parent Portal subject binding", () => {
  const currentProfileGuardians = [
    { id: "guardian-a", organization_id: "org-a", status: "active" },
  ];

  test("broad application privileges cannot expand the child list", () => {
    const visible = filterCanonicalPortalRelationships(currentProfileGuardians, [
      linked,
      unrelated,
    ]);

    expect(visible.map((relationship) => relationship.student_id)).toEqual(["child-a"]);
  });

  test("allows the exact active linked child", () => {
    expect(
      filterCanonicalPortalRelationships(currentProfileGuardians, [linked, unrelated], "child-a"),
    ).toEqual([linked]);
  });

  test("denies an unrelated same-scope child", () => {
    expect(
      filterCanonicalPortalRelationships(currentProfileGuardians, [linked, unrelated], "child-b"),
    ).toEqual([]);
  });

  test("denies inactive or organization-inconsistent relationships", () => {
    expect(
      filterCanonicalPortalRelationships(currentProfileGuardians, [
        { ...linked, status: "inactive" },
        { ...linked, organization_id: "org-b" },
      ]),
    ).toEqual([]);
  });

  test("can_view_academic=false remains linked but cannot authorize academic surfaces", () => {
    const visible = filterCanonicalPortalRelationships(currentProfileGuardians, [
      { ...linked, can_view_academic: false },
    ]);
    expect(visible).toHaveLength(1);
    expect(visible[0].can_view_academic).toBe(false);
  });
});

test("Parent current Report Cards include only published exact-child rows", () => {
  const rows = [
    { id: "published-child", studentId: "QA Student B2 Retry", status: "published" },
    { id: "draft-child", studentId: "QA Student B2 Retry", status: "draft" },
    { id: "submitted-child", studentId: "QA Student B2 Retry", status: "submitted" },
    { id: "reviewed-child", studentId: "QA Student B2 Retry", status: "reviewed" },
    { id: "revised-child", studentId: "QA Student B2 Retry", status: "revised" },
    { id: "unrelated", studentId: "Siswa Demo 01", status: "published" },
  ];
  expect(
    filterCurrentPublishedPortalReports(rows, "QA Student B2 Retry").map((row) => row.id),
  ).toEqual(["published-child"]);
  expect(filterCurrentPublishedPortalReports(rows, "unknown-subject")).toEqual([]);
});

test("attendance RPC retains the Supabase client receiver", async () => {
  const client = {
    marker: "bound-client",
    async rpc(fn, args) {
      if (this.marker !== "bound-client") throw new Error("lost receiver");
      return { data: [{ fn, studentId: args.p_student_id }], error: null };
    },
  };

  const result = await callParentAttendanceRpc(client, { p_student_id: "child-a" });

  expect(result.data).toEqual([{ fn: "list_parent_student_attendance", studentId: "child-a" }]);
});
