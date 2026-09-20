import { createFileRoute } from "@tanstack/react-router";
import { TeachingJournalManagerPage } from "@/components/teacher-daily-operations/teaching-journal-ui";

export const Route = createFileRoute("/_authenticated/teaching-journals/manage")({
  component: TeachingJournalManagerPage,
});
