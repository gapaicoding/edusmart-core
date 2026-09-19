import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const migrationPath = resolve(
  import.meta.dir,
  "../../supabase/migrations/20260918140000_b12_parent_decision_version_projection.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const appliedSource = readFileSync(
  resolve(
    import.meta.dir,
    "../../supabase/migrations/20260915180000_b12_permission_commands_read_projections.sql",
  ),
  "utf8",
);
const wrappers = readFileSync(
  resolve(import.meta.dir, "notifications-parent-permissions.functions.ts"),
  "utf8",
);
const projectionNames = ["list_parent_permission_requests", "get_parent_permission_request"];
const ownerPredicate = "d.decided_by_profile_id=auth.uid()";

function body(source, name) {
  const start = source.indexOf(`function public.${name}`);
  const end = source.indexOf("$$;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function projectionFieldExpressions(source) {
  const fields = {};
  const fieldPattern = /'(owned_by_me|decision_version)'\s*,/gi;
  let match;
  while ((match = fieldPattern.exec(source)) !== null) {
    const key = match[1].toLowerCase();
    if (fields[key]) throw new Error(`duplicate ${key} projection key`);
    let index = fieldPattern.lastIndex;
    while (/\s/.test(source[index] ?? "")) index += 1;
    const start = index;
    let depth = 0;
    let quote = false;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (character === "'") {
        if (quote && source[index + 1] === "'") index += 1;
        else quote = !quote;
      } else if (!quote && character === "(") depth += 1;
      else if (!quote && character === ")") depth -= 1;
      else if (!quote && depth === 0 && character === ",") break;
    }
    if (quote || depth !== 0 || index >= source.length)
      throw new Error(`unparseable ${key} projection expression`);
    fields[key] = source.slice(start, index).trim();
    fieldPattern.lastIndex = index + 1;
  }
  return fields;
}

function stripOuterParentheses(value) {
  let result = value.trim();
  let changed = true;
  while (changed && result.startsWith("(") && result.endsWith(")")) {
    changed = false;
    let depth = 0;
    let quote = false;
    let closesAtEnd = true;
    for (let index = 0; index < result.length; index += 1) {
      const character = result[index];
      if (character === "'") quote = !quote;
      if (quote) continue;
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0 && index !== result.length - 1) {
          closesAtEnd = false;
          break;
        }
      }
    }
    if (closesAtEnd && depth === 0) {
      result = result.slice(1, -1).trim();
      changed = true;
    }
  }
  return result;
}

function normalizePredicate(value) {
  return stripOuterParentheses(value).toLowerCase().replace(/\s+/g, "");
}

function extractOwnerPredicate(expression, field) {
  const normalized = normalizePredicate(expression);
  if (field === "owned_by_me") {
    if (!normalized || normalized.startsWith("case") || !normalized.includes("="))
      throw new Error("unparseable owned_by_me ownership guard");
    return normalized;
  }
  const match = normalized.match(/^casewhen(.+)thend\.versionelsenullend$/);
  if (!match || !match[1] || !match[1].includes("="))
    throw new Error("unparseable decision_version ownership guard");
  return normalizePredicate(match[1]);
}

function validateOwnershipProjection(source) {
  const fields = projectionFieldExpressions(source);
  if (!fields.owned_by_me) throw new Error("missing owned_by_me expression");
  if (!fields.decision_version) throw new Error("missing decision_version expression");
  const ownedPredicate = extractOwnerPredicate(fields.owned_by_me, "owned_by_me");
  const versionPredicate = extractOwnerPredicate(fields.decision_version, "decision_version");
  if (ownedPredicate !== versionPredicate)
    throw new Error("owned_by_me and decision_version ownership predicates diverge");
  if (ownedPredicate !== ownerPredicate)
    throw new Error("ownership predicate is not the authenticated profile identity");
  if (normalizePredicate(fields.decision_version) === "d.version")
    throw new Error("decision_version is unconditionally exposed");
  return { fields, predicate: ownedPredicate };
}

function projectionWith(source, name, mutation) {
  const start = source.indexOf(`function public.${name}`);
  const end = source.indexOf("$$;", start);
  const functionSource = source.slice(start, end);
  const mutated = mutation(functionSource);
  if (mutated === functionSource) throw new Error(`mutation did not match ${name}`);
  return source.slice(0, start) + mutated + source.slice(end);
}

describe("B12 Parent decision version projection", () => {
  test("extracts both keyed expressions from the actual list and detail source", () => {
    for (const name of projectionNames) {
      const result = validateOwnershipProjection(body(migration, name));
      expect(result.fields.owned_by_me).toContain("d.decided_by_profile_id");
      expect(result.fields.decision_version).toContain("d.version");
      expect(result.predicate).toBe(ownerPredicate);
    }
  });

  test("fails closed for a decision_version identity mismatch in either projection", () => {
    for (const name of projectionNames) {
      const defective = projectionWith(migration, name, (source) =>
        source.replace(
          /('decision_version'\s*,\s*case\s+when\s+)d\.decided_by_profile_id=auth\.uid\(\)/i,
          "$1d.decided_by_profile_id=g.id",
        ),
      );
      expect(() => validateOwnershipProjection(body(defective, name))).toThrow();
    }
  });

  test("fails closed for an owned_by_me identity mismatch in either projection", () => {
    for (const name of projectionNames) {
      const defective = projectionWith(migration, name, (source) =>
        source.replace(
          /('owned_by_me'\s*,\s*)d\.decided_by_profile_id=auth\.uid\(\)/i,
          "$1d.decided_by_profile_id=r.id",
        ),
      );
      expect(() => validateOwnershipProjection(body(defective, name))).toThrow();
    }
  });

  test("rejects unconditional, missing, and unparseable decision version guards", () => {
    const list = body(migration, "list_parent_permission_requests");
    expect(() =>
      validateOwnershipProjection(
        list.replace(
          /'decision_version'\s*,\s*case\s+when\s+d\.decided_by_profile_id=auth\.uid\(\)\s+then\s+d\.version\s+else\s+null\s+end/i,
          "'decision_version',d.version",
        ),
      ),
    ).toThrow();
    expect(() =>
      validateOwnershipProjection(
        list.replace(/,\s*'decision_version'\s*,\s*case[\s\S]*?end\s*,/i, ","),
      ),
    ).toThrow();
    expect(() =>
      validateOwnershipProjection(
        list.replace(
          /'decision_version'\s*,\s*case\s+when\s+d\.decided_by_profile_id=auth\.uid\(\)\s+then\s+d\.version\s+else\s+null\s+end/i,
          "'decision_version',case when owner_token then d.version else null end",
        ),
      ),
    ).toThrow();
  });

  test("rejects wrong identity domains and conflicting keyed predicates", () => {
    const list = body(migration, "list_parent_permission_requests");
    expect(() =>
      validateOwnershipProjection(list.replace(ownerPredicate, "d.decided_by_profile_id=g.id")),
    ).toThrow();
    expect(() =>
      validateOwnershipProjection(
        list.replace(
          "'owned_by_me',d.decided_by_profile_id=auth.uid()",
          "'owned_by_me',d.decided_by_profile_id=auth.uid(), 'owned_by_me',d.decided_by_profile_id=g.id",
        ),
      ),
    ).toThrow();
  });

  test("preserves first-decision null semantics and separates can_respond", () => {
    for (const name of projectionNames) {
      const source = body(migration, name);
      expect(source).toContain("'decision',d.decision");
      expect(source).toContain("then d.version else null end");
      expect(source).toContain("q.status='open' and q.due_at>transaction_timestamp()");
      expect(source).toContain("d.id is null or d.decided_by_profile_id=auth.uid()");
      expect(source).toContain("'can_respond'");
    }
  });

  test("retains scope, authorization, pagination, cardinality, and safe migration scope", () => {
    for (const name of projectionNames) {
      const source = body(migration, name);
      expect(source).toContain("security definer stable set search_path=public");
      expect(source).toContain("sg.organization_id=r.organization_id");
      expect(source).toContain("sg.status='active' and sg.can_manage_permissions");
      expect(source).toContain("g.profile_id=auth.uid()");
      expect(source).toContain("g.status='active'");
      expect(source).toContain("p.status='active'");
      expect(source).toContain("d.request_recipient_id=r.id");
    }
    const list = body(migration, "list_parent_permission_requests");
    expect(list).toContain("least(greatest(p_page_size,1),100)");
    expect(list).toContain("offset greatest(p_offset,0)");
    expect(migration).toMatch(/^begin;[\s\S]*commit;\s*$/i);
    expect(migration).not.toMatch(
      /submit_parent_permission_decision|create\s+table|alter\s+table|create\s+policy|enable\s+row\s+level\s+security/i,
    );
    expect(migration).not.toMatch(/insert\s+into|update\s+public\.|delete\s+from/i);
    expect(migration).not.toMatch(
      /list_permission_decision_history|list_my_notifications|mark_notification_read/i,
    );
  });

  test("binds mutation ownership and CAS to the applied source", () => {
    const mutationStart = appliedSource.indexOf(
      "create or replace function public.submit_parent_permission_decision",
    );
    const mutationEnd = appliedSource.indexOf("$$;", mutationStart);
    const mutation = appliedSource.slice(mutationStart, mutationEnd);
    expect(mutation).toContain("g.profile_id=auth.uid()");
    expect(mutation).toContain("decided_by_profile_id");
    expect(mutation).toContain("p_expected_version");
    expect(mutation).toMatch(
      /d\.version\s*(?:<>|=)\s*p_expected_version|p_expected_version\s*(?:<>|=)\s*d\.version/i,
    );
    expect(wrappers).toContain('"submit_parent_permission_decision"');
    expect(wrappers).toContain("p_expected_version: data.expectedVersion ?? null");
  });
});
