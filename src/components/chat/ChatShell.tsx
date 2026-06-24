import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createThread, deleteThread, listThreads, renameThread } from "@/lib/chat.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Menu, Trash2, Pencil, LogOut, Check, X, Settings, Search } from "lucide-react";
import auroraMark from "@/assets/aurora-mark.png";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "./SettingsDialog";
import { withRetry } from "@/lib/with-retry";
import { AsyncBoundary } from "@/components/AsyncBoundary";

type Thread = { id: string; title: string; updated_at: string };

export function ChatShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { threadId?: string };
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const rename = useServerFn(renameThread);
  const remove = useServerFn(deleteThread);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState<unknown>(null);

  async function refresh() {
    setThreadsLoading(true);
    setThreadsError(null);
    try {
      const res = await withRetry(() => list() as Promise<Thread[]>, {
        retries: 2,
        timeoutMs: 8000,
      });
      setThreads(res);
    } catch (e) {
      console.error(e);
      setThreadsError(e);
    } finally {
      setThreadsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const handler = () => refresh();
    window.addEventListener("aurora:threads-changed", handler);
    return () => window.removeEventListener("aurora:threads-changed", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleNew() {
    const t = await create();
    await refresh();
    setOpen(false);
    navigate({ to: "/app/c/$threadId", params: { threadId: t.id } });
  }

  async function handleDelete(id: string) {
    await remove({ data: { id } });
    const next = threads.filter((t) => t.id !== id);
    setThreads(next);
    if (params.threadId === id) {
      if (next[0]) navigate({ to: "/app/c/$threadId", params: { threadId: next[0].id } });
      else navigate({ to: "/app" });
    }
  }

  function startRename(t: Thread) {
    setEditingId(t.id);
    setEditingValue(t.title);
  }

  async function commitRename(id: string) {
    const title = editingValue.trim();
    if (!title) return setEditingId(null);
    await rename({ data: { id, title } });
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    setEditingId(null);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
    toast.success("Signed out");
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Mobile top bar */}
      <div className="absolute left-0 right-0 top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-background/80 px-3 backdrop-blur md:hidden">
        <button
          className="rounded-md p-2 hover:bg-accent"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <img src={auroraMark} alt="" width={20} height={20} />
          <span className="font-serif italic">aurora</span>
        </div>
        <button
          className="rounded-md p-2 hover:bg-accent"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="size-5" />
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform md:relative md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
          <Link to="/app" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <img src={auroraMark} alt="" width={22} height={22} />
            <span className="font-serif text-lg italic tracking-tight">aurora</span>
          </Link>
          <button
            className="rounded-md p-1.5 hover:bg-sidebar-accent md:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-3 pt-3">
          <Button onClick={handleNew} className="w-full justify-start gap-2" variant="default">
            <Plus className="size-4" /> New chat
          </Button>
        </div>

        <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          {(threadsLoading || !!threadsError) && (
            <AsyncBoundary
              compact
              loading={threadsLoading && !threadsError}
              error={threadsError}
              onRetry={refresh}
              loadingLabel="Loading conversations…"
              errorTitle="Couldn't load conversations"
            />
          )}
          {!threadsLoading && !threadsError && threads.length === 0 && (
            <p className="px-3 py-6 text-xs text-muted-foreground">
              No conversations yet. Start a new chat to begin.
            </p>
          )}
          {(searchQuery
            ? threads.filter((t) =>
                (t.title || "").toLowerCase().includes(searchQuery.toLowerCase()),
              )
            : threads
          ).map((t) => {
            const active = params.threadId === t.id;
            const isEditing = editingId === t.id;
            return (
              <div
                key={t.id}
                className={cn(
                  "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/60",
                )}
              >
                {isEditing ? (
                  <>
                    <input
                      className="flex-1 rounded bg-background px-2 py-1 text-sm outline-none ring-1 ring-ring"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(t.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button
                      className="rounded p-1 hover:bg-accent"
                      onClick={() => commitRename(t.id)}
                      aria-label="Save"
                    >
                      <Check className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/app/c/$threadId"
                      params={{ threadId: t.id }}
                      onClick={() => setOpen(false)}
                      className="flex-1 truncate"
                    >
                      {t.title || "Untitled"}
                    </Link>
                    <button
                      className="rounded p-1 opacity-0 transition hover:bg-accent group-hover:opacity-100"
                      onClick={() => startRename(t)}
                      aria-label="Rename"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      className="rounded p-1 opacity-0 transition hover:bg-accent group-hover:opacity-100"
                      onClick={() => handleDelete(t.id)}
                      aria-label="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 truncate text-xs text-muted-foreground" title={email ?? ""}>
            {email}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-1 w-full justify-start gap-2"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-4" /> Settings
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleSignOut}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      )}

      <main className="relative flex flex-1 flex-col overflow-hidden pt-12 md:pt-0">
        <button
          className="absolute right-4 top-3 z-20 hidden rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:block"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="size-5" />
        </button>
        {children}
      </main>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
