-- A Categoria do chamado do HelpDesk passou a listar os módulos do sistema (os mesmos
-- nomes usados na tela de Permissões), filtrados pelo acesso do usuário logado, em vez de
-- uma lista fixa. O check antigo só aceitava ('Hardware','Software','Rede/Internet',
-- 'Sistema Marquespan','Acesso/Senha','Outro') e passaria a rejeitar qualquer nome de módulo
-- (ex.: 'Controle de Jornada'), então precisa ser removido.
-- Execute no SQL Editor do Supabase.

alter table public.helpdesk_chamados drop constraint if exists helpdesk_chamados_categoria_check;

notify pgrst, 'reload schema';
