-- Nivel gerencia_tmg: mesmo acesso de escrita que gerencia nas paginas abaixo, porem SEM o
-- bypass de filial que administrador/gerencia tem — gerencia_tmg so pode gerenciar/ver a
-- propria Filial (definida em usuarios.filial, ex.: 'TMG'). A restricao de leitura por filial
-- ja e feita hoje comparando p_filial = u.filial pra qualquer nivel fora da lista de bypass,
-- entao NAO adicionamos gerencia_tmg nessa lista — só na lista de "quem pode gerenciar".
--
-- Antes de usar o nivel, cadastre a linha em nivel_permissoes (nivel = 'gerencia_tmg') com as
-- paginas permitidas, pela tela de Permissoes, e defina filial = 'TMG' no usuario.
--
-- Execute no SQL Editor do Supabase.

-- 1) Escala / Planejamento / Faltas / Diarias / Peso de Rota (via escala_rls) ---------------
create or replace function public.usuario_pode_gerenciar_escala()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and lower(u.nivel) in ('administrador', 'gerencia', 'gerencia_tmg', 'balanca', 'equipe_noturno', 'adm_logistica', 'logistica', 'lider_balanca')
  );
$$;

create or replace function public.usuario_pode_gerenciar_filial_escala(p_filial text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and lower(u.nivel) in ('administrador', 'gerencia', 'gerencia_tmg', 'balanca', 'equipe_noturno', 'adm_logistica', 'logistica', 'lider_balanca')
      and (
        -- gerencia_tmg fica de fora deste bypass de propósito: precisa bater a filial.
        lower(u.nivel) in ('administrador', 'gerencia', 'lider_balanca')
        or coalesce(p_filial, '') = coalesce(u.filial, '')
      )
  );
$$;

-- 2) Funcionarios -----------------------------------------------------------------------------
-- Tabela nao tem coluna de filial no RLS (restricao de filial fica so no app, igual a gerencia
-- hoje) — gerencia_tmg so precisa entrar na lista de quem pode gravar.
create or replace function public.usuario_pode_gerenciar_funcionarios()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and lower(u.nivel) in ('administrador', 'gerencia', 'gerencia_tmg')
  );
$$;

-- 3) Supervisores -----------------------------------------------------------------------------
-- Cadastro nao tem conceito de Filial (e por UF) — gerencia_tmg so precisa entrar na lista de
-- quem pode gravar, igual gerencia ja tem hoje.
create or replace function public.usuario_pode_gerenciar_cadastros()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.status, 'ATIVO') <> 'INATIVO'
      and lower(u.nivel) in ('administrador', 'gerencia', 'gerencia_tmg')
  );
$$;

notify pgrst, 'reload schema';
