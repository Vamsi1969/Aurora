import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createThread, listThreads } from "@/lib/chat.functions";
import { EmptyState } from "@/components/chat/EmptyState";

export const Route = createFileRoute("/_authenticated/app/")({
  component: AppIndex,
});

function AppIndex() {
  const navigate = useNavigate();
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const threads = await list();
      if (cancelled) return;
      if (threads.length > 0) {
        navigate({ to: "/app/c/$threadId", params: { threadId: threads[0].id }, replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [list, navigate]);

  async function startNew(initialPrompt?: string) {
    setWorking(true);
    const t = await create();
    navigate({
      to: "/app/c/$threadId",
      params: { threadId: t.id },
      search: initialPrompt ? { q: initialPrompt } : undefined,
    });
  }

  return <EmptyState onStart={startNew} working={working} />;
}