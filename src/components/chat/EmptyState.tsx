import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";
import auroraMark from "@/assets/aurora-mark.png";

const STARTERS = [
  "Explain quantum entanglement like I'm 12.",
  "Draft a polite email asking for a deadline extension.",
  "Plan a 3-day trip to Lisbon for a foodie.",
  "Help me brainstorm a name for a coffee subscription service.",
];

export function EmptyState({
  onStart,
  working,
}: {
  onStart: (prompt?: string) => void;
  working: boolean;
}) {
  const [input, setInput] = useState("");
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4">
      <div className="aurora-glow pointer-events-none absolute left-1/2 top-1/3 h-[500px] w-[600px] -translate-x-1/2 -translate-y-1/2" />
      <div className="relative z-10 flex flex-col items-center text-center">
        <img
          src={auroraMark}
          alt="Aurora"
          width={72}
          height={72}
          className="mb-5 drop-shadow-xl"
        />
        <h1 className="font-serif text-4xl italic tracking-tight md:text-5xl">
          What's on your mind?
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          Ask anything. Aurora can explain, draft, brainstorm, and code with you.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim() || working) return;
            onStart(input.trim());
          }}
          className="mt-8 w-full max-w-xl"
        >
          <div className="relative">
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message Aurora…"
              className="w-full rounded-2xl border border-border bg-card py-4 pl-5 pr-14 text-base shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/40"
              disabled={working}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 top-1/2 size-9 -translate-y-1/2 rounded-full"
              disabled={!input.trim() || working}
            >
              <ArrowUp className="size-4" />
            </Button>
          </div>
        </form>

        <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => onStart(s)}
              disabled={working}
              className="rounded-xl border border-border bg-card/60 px-4 py-3 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-card hover:text-foreground disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}