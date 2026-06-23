import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getSharedConversation } from "@/lib/chat.functions";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import auroraMark from "@/assets/aurora-mark.png";

type Attachment = { kind: "image" | "file"; url: string; name?: string; mediaType?: string };

export const Route = createFileRoute("/s/$shareId")({
  loader: async ({ params }) => {
    const data = await getSharedConversation({ data: { shareId: params.shareId } });
    if (!data) throw notFound();
    return data;
  },
  component: SharedConversation,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center p-8 text-center">
      <div>
        <h1 className="font-serif text-2xl italic">Conversation not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This share link is invalid or has been revoked.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm underline">
          Go home
        </Link>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
});

function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is Attachment => !!a && typeof a === "object");
}

type SharedMsg = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  attachments: unknown;
};

function SharedConversation() {
  const data = Route.useLoaderData() as {
    thread: { id: string; title: string; created_at: string };
    messages: SharedMsg[];
  };
  const { thread, messages } = data;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src={auroraMark} alt="" width={22} height={22} />
            <span className="font-serif text-lg italic">aurora</span>
          </Link>
          <span className="text-xs text-muted-foreground">Shared conversation</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 font-serif text-2xl italic">{thread.title || "Untitled"}</h1>
        <div className="space-y-6">
          {messages.map((m) => {
            const atts = parseAttachments(m.attachments);
            const images = atts.filter((a) => a.kind === "image");
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex flex-col items-end gap-1">
                  {images.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-2">
                      {images.map((a, i) => (
                        <img
                          key={i}
                          src={a.url}
                          alt=""
                          className="max-h-60 rounded-xl border border-border"
                        />
                      ))}
                    </div>
                  )}
                  {m.content && (
                    <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-secondary px-4 py-2.5 text-secondary-foreground">
                      <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.content}</p>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <div key={m.id} className="flex gap-3">
                <img
                  src={auroraMark}
                  alt=""
                  width={28}
                  height={28}
                  className="mt-0.5 size-7 shrink-0 rounded-full"
                />
                <div className="prose-chat min-w-0 flex-1 text-[15px] leading-relaxed">
                  {m.content && (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  )}
                  {images.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {images.map((a, i) => (
                        <img
                          key={i}
                          src={a.url}
                          alt=""
                          className="max-h-96 rounded-xl border border-border object-contain"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
