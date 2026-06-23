-- Adiciona controle separado de Boletim de Ocorrencia na Fiscalizacao.
-- Execute no SQL Editor do Supabase.

alter table public.fiscalizacao_ocorrencias
  add column if not exists boletim_ocorrencia_status text not null default 'NAO_EMITIDO';

alter table public.fiscalizacao_ocorrencias
  drop constraint if exists fiscalizacao_ocorrencias_boletim_status_check;

alter table public.fiscalizacao_ocorrencias
  add constraint fiscalizacao_ocorrencias_boletim_status_check
  check (boletim_ocorrencia_status in ('EMITIDO', 'NAO_EMITIDO'));

alter table public.fiscalizacao_ocorrencias_anexos
  add column if not exists categoria text not null default 'GERAL';

alter table public.fiscalizacao_ocorrencias_anexos
  drop constraint if exists fiscalizacao_ocorrencias_anexos_categoria_check;

alter table public.fiscalizacao_ocorrencias_anexos
  add constraint fiscalizacao_ocorrencias_anexos_categoria_check
  check (categoria in ('GERAL', 'BOLETIM_OCORRENCIA'));

create index if not exists idx_fiscalizacao_ocorrencias_anexos_categoria
  on public.fiscalizacao_ocorrencias_anexos (ocorrencia_id, categoria);

notify pgrst, 'reload schema';
