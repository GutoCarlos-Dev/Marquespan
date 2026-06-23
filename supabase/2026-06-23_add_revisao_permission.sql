-- Adiciona a pagina Revisao ao menu/permissoes dos niveis que ja acessam manutencao.
-- Execute no SQL Editor do Supabase.

update public.nivel_permissoes
set paginas_permitidas = array_append(paginas_permitidas, 'revisao.html')
where (
    'coletar-manutencao.html' = any(coalesce(paginas_permitidas, array[]::text[]))
    or 'buscar-manutencao.html' = any(coalesce(paginas_permitidas, array[]::text[]))
)
and 'revisao.html' <> all(coalesce(paginas_permitidas, array[]::text[]));

notify pgrst, 'reload schema';
