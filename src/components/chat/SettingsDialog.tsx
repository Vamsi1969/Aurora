import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProfile, updateProfile } from "@/lib/chat.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { GithubPanel } from "./GithubPanel";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const fetchProfile = useServerFn(getProfile);
  const saveProfile = useServerFn(updateProfile);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    fetchProfile()
      .then((p) => {
        setSystemPrompt(p?.system_prompt ?? "");
        setDisplayName(p?.display_name ?? "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [open, loaded, fetchProfile]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveProfile({
        data: {
          system_prompt: systemPrompt.trim() || null,
          display_name: displayName.trim() || null,
        },
      });
      toast.success("Settings saved");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Personalize Aurora</DialogTitle>
          <DialogDescription>
            Custom instructions are prepended to every conversation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">What should Aurora call you?</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp">Custom instructions</Label>
            <Textarea
              id="sp"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="e.g. I'm a senior engineer. Be terse. Prefer TypeScript. Skip disclaimers."
              rows={8}
              maxLength={4000}
            />
            <p className="text-[11px] text-muted-foreground">{systemPrompt.length} / 4000</p>
          </div>
          <div className="border-t border-border pt-4">
            <GithubPanel />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
