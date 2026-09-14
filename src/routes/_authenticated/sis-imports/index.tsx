import { createFileRoute } from "@tanstack/react-router";
import { SisImportHistoryPage } from "@/components/sis-import/sis-import-ui";

export const Route = createFileRoute("/_authenticated/sis-imports/")({
  component: SisImportHistoryPage,
  head: () => ({ meta: [{ title: "SIS Imports · EduSmart SchoolOS" }] }),
});
