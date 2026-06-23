
ALTER TABLE public.threads ADD COLUMN share_id text UNIQUE;
CREATE INDEX threads_share_id_idx ON public.threads(share_id) WHERE share_id IS NOT NULL;

-- Allow anon + authenticated to read threads with a share_id
GRANT SELECT ON public.threads TO anon;
GRANT SELECT ON public.messages TO anon;

CREATE POLICY "public shared threads" ON public.threads FOR SELECT TO anon, authenticated
  USING (share_id IS NOT NULL);

CREATE POLICY "public shared messages" ON public.messages FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.threads t WHERE t.id = thread_id AND t.share_id IS NOT NULL));
