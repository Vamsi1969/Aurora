import { createFileRoute } from "@tanstack/react-router";
import { RagSearchPanel } from "@/components/rag/RagSearchPanel";
import { ClientOnly } from "@/components/ClientOnly";

export const Route = createFileRoute("/_authenticated/app/rag")({
  component: () => (
    <ClientOnly>
      <RagSearchPanel />
    </ClientOnly>
  ),
});
