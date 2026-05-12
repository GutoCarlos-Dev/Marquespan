-- Corrigindo a vulnerabilidade de privilégios na view public.estoque_geral
-- O parâmetro SECURITY DEFINER faz com que a view ignore as políticas de RLS 
-- e use as permissões do criador (geralmente o admin).

-- Esta alteração altera a view para SECURITY INVOKER (padrão recomendado),
-- garantindo que ela respeite as políticas de RLS do usuário logado.

ALTER VIEW public.estoque_geral SET (security_invoker = true);

-- Caso sua versão do PostgreSQL seja anterior à 15, você precisará recriar a view
-- removendo explicitamente a cláusula "SECURITY DEFINER" do comando CREATE VIEW.