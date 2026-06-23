-- Adiciona o relatorio ao menu/permissoes dos niveis que ja acessam peso-rota.html.
-- Execute no SQL Editor do Supabase.

update public.nivel_permissoes
set paginas_permitidas = array_append(paginas_permitidas, 'relatorio-peso-rota.html')
where 'peso-rota.html' = any(coalesce(paginas_permitidas, array[]::text[]))
  and 'relatorio-peso-rota.html' <> all(coalesce(paginas_permitidas, array[]::text[]));

notify pgrst, 'reload schema';
