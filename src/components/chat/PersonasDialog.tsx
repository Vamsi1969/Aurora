import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listPersonas,
  createPersona,
  updatePersona,
  deletePersona,
} from "@/lib/personas.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type Persona = {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  voice: string;
  icon: string;
  is_built_in: boolean;
};

const VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
];

const empty = {
  name: "",
  description: "",
  system_prompt: "",
  voice: "alloy",
  icon: "sparkles",
};

export function PersonasDialog({
  open,
  onOpenChange,
  onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChange?: () => void;
}) {
  const list = useServerFn(listPersonas);
  const create = useServerFn(createPersona);
  const update = useServerFn(updatePersona);
  const remove = useServerFn(deletePersona);

  const [items, setItems] = useState<Persona[]>([]);
  const [editing, setEditing] = useState<Persona | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      setItems((await list()) as Persona[]);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (!open) return;
    refresh();
    setEditing(null);
    setForm(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function startEdit(p: Persona) {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      system_prompt: p.system_prompt,
      voice: p.voice,
      icon: p.icon,
    });
  }

  function startNew() {
    setEditing({
      id: "",
      name: "",
      description: "",
      system_prompt: "",
      voice: "alloy",
      icon: "sparkles",
      is_built_in: false,
    });
    setForm(empty);
  }

  async function handleSave() {
    if (!editing) return;
    if (!form.name.trim() || !form.system_prompt.trim()) {
      toast.error("Name and prompt are required");
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        await update({
          data: {
            id: editing.id,
            name: form.name.trim(),
            description: form.description.trim() || null,
            system_prompt: form.system_prompt.trim(),
            voice: form.voice as never,
            icon: form.icon,
          },
        });
      } else {
        await create({
          data: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            system_prompt: form.system_prompt.trim(),
            voice: form.voice as never,
            icon: form.icon,
          },
        });
      }
      toast.success("Persona saved");
      setEditing(null);
      await refresh();
      onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Persona) {
    if (p.is_built_in) return;
    if (!confirm(`Delete persona "${p.name}"?`)) return;
    try {
      await remove({ data: { id: p.id } });
      await refresh();
      if (editing?.id === p.id) setEditing(null);
      onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>AI personas</DialogTitle>
          <DialogDescription>
            Switch between distinct personalities and voices. Built-in personas are read-only —
            duplicate via "New persona" to tweak.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          <div className="space-y-1 overflow-y-auto pr-1 md:max-h-[60vh]">
            <Button onClick={startNew} className="mb-2 w-full justify-start gap-2" variant="outline">
              <Plus className="size-4" /> New persona
            </Button>
            {items.map((p) => (
              <button
                key={p.id}
                onClick={() => startEdit(p)}
                className={cn(
                  "group flex w-full items-start gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm hover:bg-accent",
                  editing?.id === p.id && "border-border bg-accent",
                )}
              >
                <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate font-medium">{p.name}</span>
                    {p.is_built_in && (
                      <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Built-in" />
                    )}
                  </div>
                  {p.description && (
                    <p className="truncate text-xs text-muted-foreground">{p.description}</p>
                  )}
                </div>
                {!p.is_built_in && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(p);
                      }
                    }}
                    className="rounded p-1 opacity-0 transition hover:bg-background group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="space-y-3 overflow-y-auto md:max-h-[60vh]">
            {!editing ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Pick a persona on the left, or click <Pencil className="mx-1 inline size-3.5" />{" "}
                New persona to create your own.
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="p-name">Name</Label>
                  <Input
                    id="p-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    disabled={editing.is_built_in}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-desc">Short description</Label>
                  <Input
                    id="p-desc"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Patient teacher who explains step-by-step."
                    disabled={editing.is_built_in}
                    maxLength={280}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-prompt">System prompt</Label>
                  <Textarea
                    id="p-prompt"
                    value={form.system_prompt}
                    onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                    placeholder="You are a thoughtful assistant who…"
                    disabled={editing.is_built_in}
                    rows={8}
                    maxLength={4000}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Read-aloud voice</Label>
                  <Select
                    value={form.voice}
                    onValueChange={(v) => setForm({ ...form, voice: v })}
                    disabled={editing.is_built_in}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VOICES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v[0].toUpperCase() + v.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {editing && !editing.is_built_in && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editing.id ? "Save changes" : "Create persona"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}