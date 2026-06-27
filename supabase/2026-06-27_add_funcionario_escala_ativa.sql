alter table public.funcionario
add column if not exists escala_ativa boolean not null default true;

comment on column public.funcionario.escala_ativa is
'Define se o colaborador pode aparecer nas listas e reservas da pagina de escala.';
