import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ChatWindow } from "@/components/chat/ChatWindow";

export const Route = createFileRoute("/_authenticated/app/c/$threadId")({
  validateSearch: z.object({ q: z.string().optional() }),
  component: ChatRoute,
});

function ChatRoute() {
  const { threadId } = Route.useParams();
  const { q } = Route.useSearch();
  return <ChatWindow key={threadId} threadId={threadId} initialPrompt={q} />;
}
