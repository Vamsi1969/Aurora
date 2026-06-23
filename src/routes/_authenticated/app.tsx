import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ChatShell } from "@/components/chat/ChatShell";

export const Route = createFileRoute("/_authenticated/app")({
  component: () => (
    <ChatShell>
      <Outlet />
    </ChatShell>
  ),
});