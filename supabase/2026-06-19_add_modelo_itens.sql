alter table public.itens
  add column if not exists modelo text;

create index if not exists idx_itens_modelo
  on public.itens (modelo);

notify pgrst, 'reload schema';
