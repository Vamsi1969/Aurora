import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import auroraMark from "@/assets/aurora-mark.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Aurora" },
      { name: "description", content: "Sign in to Aurora, your AI thinking partner." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/app", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. You're in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (res.error) toast.error(res.error.message ?? "Google sign-in failed");
    setLoading(false);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* layered animated aurora background */}
      <div className="aurora-grid pointer-events-none absolute inset-0" />
      <div className="aurora-orb aurora-orb-1 left-[-10%] top-[-10%] h-[520px] w-[520px]" />
      <div className="aurora-orb aurora-orb-2 right-[-15%] top-[10%] h-[480px] w-[480px]" />
      <div className="aurora-orb aurora-orb-3 bottom-[-20%] left-[20%] h-[600px] w-[600px]" />
      <div className="aurora-noise pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/0 via-background/40 to-background/80" />

      <div className="relative z-10 w-full max-w-sm">
        <Link to="/app" className="mb-8 flex items-center justify-center gap-3">
          <img src={auroraMark} alt="" width={36} height={36} className="drop-shadow-md" />
          <span className="font-serif text-3xl italic tracking-tight">aurora</span>
        </Link>

        <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-2xl backdrop-blur-xl">
          <h1 className="font-serif text-2xl italic">
            {mode === "signin" ? "Welcome back." : "Make a new mind."}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to pick up where you left off."
              : "Create an account to save your conversations."}
          </p>

          <Button
            type="button"
            variant="outline"
            className="mt-5 w-full"
            onClick={handleGoogle}
            disabled={loading}
          >
            <GoogleIcon /> Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className="mt-1"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="text-foreground underline underline-offset-2"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.6-4.8 9.6-7.3 0-.5-.06-.9-.13-1.3H12z"
      />
    </svg>
  );
}
