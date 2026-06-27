import { createFileRoute } from "@tanstack/react-router";
import { ResumeAnalyzer } from "@/components/resume/ResumeAnalyzer";
import { ClientOnly } from "@/components/ClientOnly";

export const Route = createFileRoute("/_authenticated/app/resume")({
  component: () => (
    <ClientOnly>
      <ResumeAnalyzer />
    </ClientOnly>
  ),
});
