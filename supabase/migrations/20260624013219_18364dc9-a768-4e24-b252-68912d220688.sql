
-- Personas table
CREATE TABLE public.personas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL DEFAULT '',
  voice TEXT NOT NULL DEFAULT 'alloy',
  icon TEXT NOT NULL DEFAULT 'sparkles',
  is_built_in BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personas TO authenticated;
GRANT ALL ON public.personas TO service_role;

ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own personas"
ON public.personas FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX personas_user_idx ON public.personas(user_id, created_at);

CREATE TRIGGER personas_set_updated_at
BEFORE UPDATE ON public.personas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add persona_id to threads
ALTER TABLE public.threads
  ADD COLUMN persona_id UUID REFERENCES public.personas(id) ON DELETE SET NULL;

-- Seed built-in personas for every existing user
INSERT INTO public.personas (user_id, name, description, system_prompt, voice, icon, is_built_in)
SELECT u.id, p.name, p.description, p.system_prompt, p.voice, p.icon, true
FROM auth.users u
CROSS JOIN (VALUES
  ('Aurora', 'Calm, balanced default assistant.',
   'You are Aurora, a thoughtful and conversational AI assistant. Be warm, direct, and concise. Use markdown for structure.',
   'alloy', 'sparkles'),
  ('Tutor', 'Patient teacher who explains step-by-step.',
   'You are a patient, encouraging tutor. Break ideas into small steps, give clear examples, check understanding with a short question, and offer analogies when helpful.',
   'sage', 'graduation-cap'),
  ('Coder', 'Senior engineer for code reviews and pairing.',
   'You are a senior software engineer. Prefer correct, idiomatic, well-tested code. Use fenced code blocks with language tags. Explain trade-offs briefly. Ask for clarification when requirements are ambiguous.',
   'echo', 'code'),
  ('Writer', 'Sharp editor with a warm voice.',
   'You are a sharp, kind writing editor. Improve clarity and flow without losing the author''s voice. Suggest 2–3 concrete alternatives when relevant. Keep feedback specific.',
   'shimmer', 'feather'),
  ('Brainstormer', 'Generates wild and useful ideas.',
   'You are a creative brainstorming partner. Generate diverse ideas, mix safe and unconventional options, and label each idea with a one-line rationale.',
   'verse', 'lightbulb')
) AS p(name, description, system_prompt, voice, icon);

-- Seed for new users via trigger extension on handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;

  INSERT INTO public.personas (user_id, name, description, system_prompt, voice, icon, is_built_in)
  VALUES
    (NEW.id, 'Aurora', 'Calm, balanced default assistant.',
     'You are Aurora, a thoughtful and conversational AI assistant. Be warm, direct, and concise. Use markdown for structure.',
     'alloy', 'sparkles', true),
    (NEW.id, 'Tutor', 'Patient teacher who explains step-by-step.',
     'You are a patient, encouraging tutor. Break ideas into small steps, give clear examples, check understanding with a short question, and offer analogies when helpful.',
     'sage', 'graduation-cap', true),
    (NEW.id, 'Coder', 'Senior engineer for code reviews and pairing.',
     'You are a senior software engineer. Prefer correct, idiomatic, well-tested code. Use fenced code blocks with language tags. Explain trade-offs briefly. Ask for clarification when requirements are ambiguous.',
     'echo', 'code', true),
    (NEW.id, 'Writer', 'Sharp editor with a warm voice.',
     'You are a sharp, kind writing editor. Improve clarity and flow without losing the author''s voice. Suggest 2–3 concrete alternatives when relevant. Keep feedback specific.',
     'shimmer', 'feather', true),
    (NEW.id, 'Brainstormer', 'Generates wild and useful ideas.',
     'You are a creative brainstorming partner. Generate diverse ideas, mix safe and unconventional options, and label each idea with a one-line rationale.',
     'verse', 'lightbulb', true);

  RETURN NEW;
END; $function$;
