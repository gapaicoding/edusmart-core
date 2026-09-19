import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const foundation = readFileSync(
  "supabase/migrations/20260915160000_b12_notifications_parent_permission_foundation.sql",
  "utf8",
);
const phase2 = readFileSync(
  "supabase/migrations/20260915180000_b12_permission_commands_read_projections.sql",
  "utf8",
);
const fix = readFileSync(
  "supabase/migrations/20260918110000_b12_permission_request_lifecycle_metadata_fix.sql",
  "utf8",
);

const functionBody = (source, name) => {
  const start = source.indexOf(`function public.${name}`);
  const end = source.indexOf("\n$$", start);
  return source.slice(start, end === -1 ? source.length : end);
};

const unwrapOuterParentheses = (value) => {
  let result = value.trim();
  while (result.startsWith("(") && result.endsWith(")")) {
    let depth = 0;
    let closesAtEnd = true;
    for (let index = 0; index < result.length; index += 1) {
      if (result[index] === "(") depth += 1;
      if (result[index] === ")") depth -= 1;
      if (depth === 0 && index < result.length - 1) {
        closesAtEnd = false;
        break;
      }
    }
    if (!closesAtEnd) break;
    result = result.slice(1, -1).trim();
  }
  return result;
};

const extractCheckExpression = (source) => {
  const constraint = source.indexOf("constraint parent_permission_requests_lifecycle_fields_check");
  const check = source.indexOf("check (", constraint);
  expect(constraint).toBeGreaterThan(-1);
  expect(check).toBeGreaterThan(-1);
  const open = source.indexOf("(", check);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error("Unbalanced lifecycle CHECK expression");
};

const splitTopLevel = (expression, operator) => {
  const branches = [];
  let start = 0;
  let depth = 0;
  let quote = false;
  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] === "'" && expression[index - 1] !== "\\") quote = !quote;
    if (quote) continue;
    if (expression[index] === "(") depth += 1;
    if (expression[index] === ")") depth -= 1;
    if (
      depth === 0 &&
      expression.slice(index, index + operator.length).toLowerCase() === operator &&
      /\s/.test(expression[index - 1] ?? " ") &&
      /\s/.test(expression[index + operator.length] ?? " ")
    ) {
      branches.push(expression.slice(start, index));
      start = index + operator.length;
    }
  }
  branches.push(expression.slice(start));
  return branches.map(unwrapOuterParentheses);
};

const supportedStatuses = new Set(["draft", "open", "closed", "cancelled"]);
const supportedNullableFields = new Set(["published_at", "closed_at", "cancelled_at", "due_at"]);

const parseLifecycleBranch = (branch) => {
  const terms = splitTopLevel(branch, "and");
  let status = null;
  const predicates = {};

  for (const rawTerm of terms) {
    const term = unwrapOuterParentheses(rawTerm).replace(/\s+/g, " ").trim();
    const statusMatch = term.match(/^status\s*=\s*'([^']+)'$/i);
    if (statusMatch) {
      if (status !== null) {
        throw new Error(`Duplicate status predicate in lifecycle CHECK branch: ${term}`);
      }
      status = statusMatch[1].toLowerCase();
      if (!supportedStatuses.has(status)) {
        throw new Error(`Unsupported lifecycle status predicate: ${term}`);
      }
      continue;
    }

    const nullableMatch = term.match(
      /^(?<field>[a-z_][a-z0-9_]*)\s+is\s+(?<notNull>not\s+)?null$/i,
    );
    if (!nullableMatch || !supportedNullableFields.has(nullableMatch.groups.field.toLowerCase())) {
      throw new Error(
        `Unsupported lifecycle predicate${status ? ` in status '${status}'` : ""}: ${term}`,
      );
    }

    const field = nullableMatch.groups.field.toLowerCase();
    if (Object.hasOwn(predicates, field)) {
      throw new Error(
        `Duplicate or contradictory lifecycle predicate in status '${status ?? "unknown"}': ${term}`,
      );
    }
    predicates[field] = nullableMatch.groups.notNull ? "not-null" : "null";
  }

  if (status === null) {
    throw new Error(`Missing status predicate in lifecycle CHECK branch: ${branch}`);
  }
  return { status, predicates };
};

const parseLifecycleCheck = (source, { requireCanonicalBranches = true } = {}) => {
  const branches = splitTopLevel(extractCheckExpression(source), "or").map(parseLifecycleBranch);
  const statuses = branches.map(({ status }) => status);
  if (new Set(statuses).size !== statuses.length) {
    throw new Error(`Duplicate lifecycle status branch: ${statuses.join(",")}`);
  }
  if (requireCanonicalBranches) {
    const actual = [...statuses].sort();
    const expected = [...supportedStatuses].sort();
    if (actual.join(",") !== expected.join(",")) {
      throw new Error(`Lifecycle CHECK branch set mismatch: ${actual.join(",")}`);
    }
  }
  return branches;
};

const acceptsLifecycleRow = (branches, row) =>
  branches.some(
    (branch) =>
      branch.status === row.status &&
      Object.entries(branch.predicates).every(([field, requirement]) =>
        requirement === "not-null" ? row[field] != null : row[field] == null,
      ),
  );

const syntheticCheck = (branch) => `
alter table public.parent_permission_requests
  add constraint parent_permission_requests_lifecycle_fields_check
  check (${branch});
`;

describe("B12 lifecycle metadata remediation", () => {
  test("binds the lifecycle matrix evaluator to the migration CHECK branches", () => {
    const branches = parseLifecycleCheck(fix);
    expect(branches.map(({ status }) => status).sort()).toEqual([
      "cancelled",
      "closed",
      "draft",
      "open",
    ]);
    expect(branches.find(({ status }) => status === "cancelled").predicates).toEqual({
      closed_at: "null",
      cancelled_at: "not-null",
    });
    expect(branches.find(({ status }) => status === "open").predicates).toEqual({
      published_at: "not-null",
      closed_at: "null",
      cancelled_at: "null",
      due_at: "not-null",
    });
  });

  test("rejects unsupported lifecycle predicate grammar instead of ignoring residual SQL", () => {
    const cases = [
      [
        "unsupported operator",
        "status = 'cancelled' AND cancelled_at IS NOT NULL AND closed_at IS NULL AND version > 0",
        /Unsupported lifecycle predicate.*version > 0/,
      ],
      [
        "unknown column",
        "status = 'cancelled' AND cancelled_at IS NOT NULL AND closed_at IS NULL AND review_at IS NULL",
        /Unsupported lifecycle predicate.*review_at IS NULL/,
      ],
      [
        "unsupported function",
        "status = 'cancelled' AND cancelled_at IS NOT NULL AND closed_at IS NULL AND coalesce\(published_at, created_at\) IS NOT NULL",
        /Unsupported lifecycle predicate.*coalesce/,
      ],
      [
        "extra trailing predicate",
        "status = 'cancelled' AND cancelled_at IS NOT NULL AND closed_at IS NULL AND version > 0",
        /Unsupported lifecycle predicate.*version > 0/,
      ],
    ];
    for (const [_name, branch, error] of cases) {
      expect(() =>
        parseLifecycleCheck(syntheticCheck(branch), { requireCanonicalBranches: false }),
      ).toThrow(error);
    }
  });

  test("rejects malformed branch and matrix structures fail-closed", () => {
    expect(() =>
      parseLifecycleCheck(syntheticCheck("published_at IS NULL"), {
        requireCanonicalBranches: false,
      }),
    ).toThrow(/Missing status predicate/);
    expect(() =>
      parseLifecycleCheck(
        syntheticCheck(
          "status = 'cancelled' AND cancelled_at IS NOT NULL AND cancelled_at IS NOT NULL",
        ),
        { requireCanonicalBranches: false },
      ),
    ).toThrow(/Duplicate or contradictory lifecycle predicate/);
    expect(() =>
      parseLifecycleCheck(
        syntheticCheck("status = 'cancelled' AND closed_at IS NULL AND closed_at IS NOT NULL"),
        { requireCanonicalBranches: false },
      ),
    ).toThrow(/Duplicate or contradictory lifecycle predicate/);
    expect(() =>
      parseLifecycleCheck(
        syntheticCheck(
          "(status = 'cancelled' AND cancelled_at IS NOT NULL AND closed_at IS NULL) OR " +
            "(status = 'cancelled' AND cancelled_at IS NOT NULL AND closed_at IS NULL)",
        ),
      ),
    ).toThrow(/Duplicate lifecycle status branch/);
  });

  test.each([
    [
      "draft",
      { status: "draft", published_at: null, closed_at: null, cancelled_at: null, due_at: null },
    ],
    [
      "open",
      {
        status: "open",
        published_at: "2026-09-20T00:00:00Z",
        closed_at: null,
        cancelled_at: null,
        due_at: "2026-09-21T00:00:00Z",
      },
    ],
    [
      "closed",
      {
        status: "closed",
        published_at: "2026-09-20T00:00:00Z",
        closed_at: "2026-09-21T00:00:00Z",
        cancelled_at: null,
        due_at: "2026-09-21T00:00:00Z",
      },
    ],
    [
      "cancelled-unpublished",
      {
        status: "cancelled",
        published_at: null,
        closed_at: null,
        cancelled_at: "2026-09-21T00:00:00Z",
        due_at: null,
      },
    ],
    [
      "cancelled-published",
      {
        status: "cancelled",
        published_at: "2026-09-20T00:00:00Z",
        closed_at: null,
        cancelled_at: "2026-09-21T00:00:00Z",
        due_at: "2026-09-21T00:00:00Z",
      },
    ],
  ])("accepts valid lifecycle state: %s", (_name, row) => {
    expect(acceptsLifecycleRow(parseLifecycleCheck(fix), row)).toBe(true);
  });

  test.each([
    [
      "draft published",
      { status: "draft", published_at: "x", closed_at: null, cancelled_at: null, due_at: null },
    ],
    [
      "draft closed",
      { status: "draft", published_at: null, closed_at: "x", cancelled_at: null, due_at: null },
    ],
    [
      "draft cancelled",
      { status: "draft", published_at: null, closed_at: null, cancelled_at: "x", due_at: null },
    ],
    [
      "open without published_at",
      { status: "open", published_at: null, closed_at: null, cancelled_at: null, due_at: "x" },
    ],
    [
      "open without due_at",
      { status: "open", published_at: "x", closed_at: null, cancelled_at: null, due_at: null },
    ],
    [
      "open closed",
      { status: "open", published_at: "x", closed_at: "x", cancelled_at: null, due_at: "x" },
    ],
    [
      "open cancelled",
      { status: "open", published_at: "x", closed_at: null, cancelled_at: "x", due_at: "x" },
    ],
    [
      "closed without published_at",
      { status: "closed", published_at: null, closed_at: "x", cancelled_at: null, due_at: "x" },
    ],
    [
      "closed without closed_at",
      { status: "closed", published_at: "x", closed_at: null, cancelled_at: null, due_at: "x" },
    ],
    [
      "closed cancelled",
      { status: "closed", published_at: "x", closed_at: "x", cancelled_at: "x", due_at: "x" },
    ],
    [
      "cancelled without cancelled_at",
      {
        status: "cancelled",
        published_at: null,
        closed_at: null,
        cancelled_at: null,
        due_at: null,
      },
    ],
    [
      "cancelled closed",
      { status: "cancelled", published_at: null, closed_at: "x", cancelled_at: "x", due_at: null },
    ],
    [
      "unknown status",
      { status: "unknown", published_at: null, closed_at: null, cancelled_at: null, due_at: null },
    ],
  ])("rejects invalid lifecycle state: %s", (_name, row) => {
    expect(acceptsLifecycleRow(parseLifecycleCheck(fix), row)).toBe(false);
  });

  test("detects both the old defective CHECK and an over-loose cancelled branch", () => {
    const oldBranches = parseLifecycleCheck(foundation);
    expect(
      acceptsLifecycleRow(oldBranches, {
        status: "cancelled",
        published_at: null,
        closed_at: null,
        cancelled_at: "x",
        due_at: null,
      }),
    ).toBe(false);
    const newBranches = parseLifecycleCheck(fix);
    expect(
      acceptsLifecycleRow(newBranches, {
        status: "cancelled",
        published_at: null,
        closed_at: null,
        cancelled_at: null,
        due_at: null,
      }),
    ).toBe(false);
    expect(
      acceptsLifecycleRow(newBranches, {
        status: "cancelled",
        published_at: null,
        closed_at: "x",
        cancelled_at: "x",
        due_at: null,
      }),
    ).toBe(false);
  });

  test("proves the deployed contract forced cancelled requests to look published", () => {
    expect(foundation).toContain("status = 'cancelled' and published_at is not null");
    expect(phase2).toContain("published_at=coalesce(published_at,transaction_timestamp())");
  });

  test("allows draft cancellation without manufacturing published_at", () => {
    expect(fix).toContain("drop constraint parent_permission_requests_lifecycle_fields_check");
    expect(fix).toContain(
      "or (status = 'cancelled' and closed_at is null and cancelled_at is not null)",
    );
    const cancel = functionBody(fix, "cancel_permission_request");
    expect(cancel).toContain("cancelled_at=transaction_timestamp()");
    expect(cancel).not.toContain("published_at=");
    expect(cancel).toContain("version=public.parent_permission_requests.version+1");
  });

  test("preserves cancel authorization, replay, lifecycle, audit, ledger, and ACL", () => {
    const cancel = functionBody(fix, "cancel_permission_request");
    for (const token of [
      "b12_require_staff('permission_request.close'",
      "b12_replay_command(p_command_request_id,fp)",
      "if v.status='closed'",
      "if v.status='cancelled'",
      "if v.version<>p_expected_version",
      "'cancel',p_request_id,fp,result,true",
      "'request_cancelled'",
      "revoke all on function public.cancel_permission_request",
      "grant execute on function public.cancel_permission_request",
    ]) {
      expect(fix).toContain(token);
    }
    expect(fix).toContain("security definer set search_path=public");
  });

  test("keeps publish atomicity and failed zero-recipient semantics unchanged", () => {
    const publish = functionBody(phase2, "publish_permission_request");
    const zero = publish.indexOf("B12_NO_ELIGIBLE_RECIPIENTS");
    const publishMutation = publish.indexOf("status='open',published_at=");
    expect(zero).toBeGreaterThan(-1);
    expect(publishMutation).toBeGreaterThan(zero);
    expect(fix).not.toContain("create or replace function public.publish_permission_request");
  });

  test("does not introduce direct DML or service-role access", () => {
    expect(fix).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(fix).not.toContain("insert into public.parent_permission_requests");
  });
});
