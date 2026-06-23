import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createShareLink, getShareInfo, revokeShareLink } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Check, Link2Off, Link2 } from "lucide-react";
import { toast } from "sonner";

export function ShareDialog({
  threadId,
  open,
  onOpenChange,
}: {
  threadId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const fetchInfo = useServerFn(getShareInfo);
  const create = useServerFn(createShareLink);
  const revoke = useServerFn(revokeShareLink);
  const [shareId, setShareId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchInfo({ data: { threadId } }).then((r) => setShareId(r.shareId));
  }, [open, threadId, fetchInfo]);

  const url = shareId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${shareId}`
    : "";

  async function handleCreate() {
    setLoading(true);
    try {
      const r = await create({ data: { threadId } });
      setShareId(r.shareId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    setLoading(true);
    try {
      await revoke({ data: { threadId } });
      setShareId(null);
      toast.success("Share link revoked");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share conversation</DialogTitle>
          <DialogDescription>
            Anyone with the link can view this conversation as read-only.
          </DialogDescription>
        </DialogHeader>
        {shareId ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
              <input
                readOnly
                value={url}
                className="flex-1 bg-transparent px-2 text-sm outline-none"
              />
              <Button size="sm" variant="secondary" onClick={copyUrl}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
            <Button variant="ghost" onClick={handleRevoke} disabled={loading}>
              <Link2Off className="mr-2 size-4" /> Revoke link
            </Button>
          </div>
        ) : (
          <Button onClick={handleCreate} disabled={loading}>
            <Link2 className="mr-2 size-4" />
            {loading ? "Creating…" : "Create share link"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}