-- exec_sql: read-only RPC for the SQL Agent.
-- Only callable by authenticated users via the service-role client.
-- The function itself enforces SELECT-only + LIMIT for safety.
CREATE OR REPLACE FUNCTION public.exec_sql(query_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Safety: only allow SELECT queries
  IF upper(trim(query_text)) NOT LIKE 'SELECT%' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  -- Safety: enforce a LIMIT if none present
  IF upper(query_text) NOT LIKE '%LIMIT%' THEN
    query_text := rtrim(query_text, ';') || ' LIMIT 100;';
  END IF;

  EXECUTE query_text INTO result;
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- Revoke from public roles — only service_role may call it
REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;

-- Full-text search index for RAG queries on messages.content
CREATE INDEX IF NOT EXISTS idx_messages_content_fts
  ON public.messages
  USING gin (to_tsvector('english', coalesce(content, '')));
