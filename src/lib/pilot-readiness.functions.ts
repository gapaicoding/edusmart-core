import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildPilotReadiness,
  pilotReadinessFactsSchema,
  pilotReadinessInput,
} from "./pilot-readiness.schemas";

export const getPilotReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => pilotReadinessInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: school, error: schoolError } = await context.supabase
      .from("schools")
      .select("id, organization_id, name")
      .eq("id", data.schoolId)
      .maybeSingle();
    if (schoolError || !school) throw new Error("PILOT_READINESS_UNAVAILABLE");

    const { data: rawFacts, error } = await context.supabase.rpc("b26_get_pilot_readiness_facts", {
      p_school_id: school.id,
    });
    if (error) {
      if (error.message.includes("PILOT_READINESS_UNAVAILABLE")) {
        throw new Error("PILOT_READINESS_UNAVAILABLE");
      }
      throw new Error("PILOT_READINESS_QUERY_FAILED:projection");
    }
    const facts = pilotReadinessFactsSchema.parse(rawFacts);
    return buildPilotReadiness({ id: school.id, name: school.name }, facts);
  });
