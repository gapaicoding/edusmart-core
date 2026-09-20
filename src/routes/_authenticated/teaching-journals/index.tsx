import { createFileRoute } from "@tanstack/react-router";
import { TeachingJournalPage } from "@/components/teacher-daily-operations/teaching-journal-ui";

export const Route = createFileRoute("/_authenticated/teaching-journals/")({
  component: TeachingJournalPage,
});
