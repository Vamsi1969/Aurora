import { createFileRoute } from "@tanstack/react-router";
import { SqlAgentPanel } from "@/components/sql-agent/SqlAgentPanel";
import { ClientOnly } from "@/components/ClientOnly";

export const Route = createFileRoute("/_authenticated/app/sql")({
  component: () => (
    <ClientOnly>
      <SqlAgentPanel />
    </ClientOnly>
  ),
});
