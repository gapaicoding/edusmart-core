import { createFileRoute } from "@tanstack/react-router";
import { SisImportNewPage } from "@/components/sis-import/sis-import-ui";

export const Route = createFileRoute("/_authenticated/sis-imports/new")({
  component: SisImportNewPage,
  head: () => ({ meta: [{ title: "New SIS Import · EduSmart SchoolOS" }] }),
});
