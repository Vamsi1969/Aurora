import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPersonas, setThreadPersona } from "@/lib/personas.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Sparkles, ChevronDown, Settings2, Check } from "lucide-react";
import { PersonasDialog, type Persona } from "./PersonasDialog";
import { toast } from "sonner";

export function PersonaPicker({
  threadId,
  personaId,
  onChange,
}: {
  threadId: string;
  personaId: string | null;
  onChange: (p: Persona | null) => void;
}) {
  const list = useServerFn(listPersonas);
  const setOnThread = useServerFn(setThreadPersona);
  const [items, setItems] = useState<Persona[]>([]);
  const [open, setOpen] = useState(false);

  async function refresh() {
    try {
      setItems((await list()) as Persona[]);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = items.find((p) => p.id === personaId) ?? null;

  async function pick(p: Persona | null) {
    onChange(p);
    try {
      await setOnThread({ data: { threadId, personaId: p?.id ?? null } });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Sparkles className="size-3.5 text-muted-foreground" />
            <span className="font-medium">{active?.name ?? "Default"}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Persona
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => pick(null)} className="flex items-start gap-2">
            <div className="mt-0.5 size-4">
              {personaId === null && <Check className="size-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Default</div>
              <div className="truncate text-xs text-muted-foreground">
                Aurora's standard balanced voice
              </div>
            </div>
          </DropdownMenuItem>
          {items.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => pick(p)} className="flex items-start gap-2">
              <div className="mt-0.5 size-4">
                {personaId === p.id && <Check className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{p.name}</div>
                {p.description && (
                  <div className="truncate text-xs text-muted-foreground">{p.description}</div>
                )}
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpen(true)} className="gap-2">
            <Settings2 className="size-4" />
            Manage personas…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PersonasDialog open={open} onOpenChange={setOpen} onChange={refresh} />
    </>
  );
}
