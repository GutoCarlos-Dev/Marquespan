-- Corrigindo a vulnerabilidade de privilégios na view public.profiles
-- A view foi criada em create_jornada_tables.sql sem SECURITY INVOKER,
-- fazendo com que o Supabase aplique SECURITY DEFINER por padrão.
-- Isso ignora as políticas de RLS da tabela usuarios para quem consulta a view.

ALTER VIEW public.profiles SET (security_invoker = true);
