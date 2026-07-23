-- Permite "Restaurar" registros excluídos a partir da tela de auditoria.html.
-- Guarda uma cópia (snapshot) da linha no momento da exclusão, junto com o nome da tabela de
-- origem, para poder reinserir os dados depois. Só se aplica a exclusões feitas DEPOIS desta
-- migration — exclusões antigas não têm snapshot e continuam sem opção de restaurar.
--
-- Execute este arquivo no SQL Editor do Supabase:
-- https://hlzcycvlcuhgnnjkmslt.supabase.co

alter table public.auditoria_sistema
  add column if not exists tabela_origem text,
  add column if not exists snapshot jsonb,
  add column if not exists restaurado boolean not null default false,
  add column if not exists restaurado_por text,
  add column if not exists restaurado_em timestamptz;

create index if not exists idx_auditoria_sistema_restauravel
  on public.auditoria_sistema (acao, restaurado)
  where snapshot is not null;

-- NOTA IMPORTANTE: não mexemos em RLS aqui de propósito. Esta tabela já funciona hoje (INSERT
-- pelo registrarAuditoria() e SELECT pela tela de auditoria) sem nenhuma migration de RLS neste
-- repositório — ou seja, a política atual foi configurada direto no painel do Supabase e não
-- temos visibilidade dela aqui. Habilitar/alterar RLS às cegas poderia quebrar o que já funciona.
-- A tela de auditoria.html já restringe "Restaurar" a administradores no cliente; se quiser
-- reforçar isso a nível de banco, verifique a policy de UPDATE existente na tabela antes.
grant update on table public.auditoria_sistema to authenticated;

-- Atualiza imediatamente o cache de estrutura usado pela API REST.
notify pgrst, 'reload schema';
