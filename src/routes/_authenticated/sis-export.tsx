import { createFileRoute } from "@tanstack/react-router";
import { SisExportPage } from "@/components/sis-import/sis-import-ui";

export const Route = createFileRoute("/_authenticated/sis-export")({
  component: SisExportPage,
  head: () => ({ meta: [{ title: "SIS Export · EduSmart SchoolOS" }] }),
});
