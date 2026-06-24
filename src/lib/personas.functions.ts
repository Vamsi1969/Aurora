import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
] as const;
export type Voice = (typeof VOICES)[number];

const personaInput = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(280).nullable().optional(),
  system_prompt: z.string().max(4000),
  voice: z.enum(VOICES),
  icon: z.string().max(40).default("sparkles"),
});

export const listPersonas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("personas")
      .select("id, name, description, system_prompt, voice, icon, is_built_in, created_at")
      .order("is_built_in", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createPersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => personaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("personas")
      .insert({
        user_id: context.userId,
        name: data.name,
        description: data.description ?? null,
        system_prompt: data.system_prompt,
        voice: data.voice,
        icon: data.icon,
        is_built_in: false,
      })
      .select("id, name, description, system_prompt, voice, icon, is_built_in, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updatePersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => personaInput.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase
      .from("personas")
      .update({
        name: rest.name,
        description: rest.description ?? null,
        system_prompt: rest.system_prompt,
        voice: rest.voice,
        icon: rest.icon,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("personas")
      .delete()
      .eq("id", data.id)
      .eq("is_built_in", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setThreadPersona = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        threadId: z.string().uuid(),
        personaId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("threads")
      .update({ persona_id: data.personaId })
      .eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
