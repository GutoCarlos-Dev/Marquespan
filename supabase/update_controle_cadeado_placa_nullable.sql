alter table public.controle_cadeado
alter column placa drop not null;

alter table public.controle_cadeado enable row level security;

drop policy if exists "Permitir leitura controle cadeado" on public.controle_cadeado;
create policy "Permitir leitura controle cadeado"
on public.controle_cadeado
for select
to public
using (true);

drop policy if exists "Permitir inserir controle cadeado" on public.controle_cadeado;
create policy "Permitir inserir controle cadeado"
on public.controle_cadeado
for insert
to public
with check (true);

drop policy if exists "Permitir atualizar controle cadeado" on public.controle_cadeado;
create policy "Permitir atualizar controle cadeado"
on public.controle_cadeado
for update
to public
using (true)
with check (true);

drop policy if exists "Permitir excluir controle cadeado" on public.controle_cadeado;
create policy "Permitir excluir controle cadeado"
on public.controle_cadeado
for delete
to public
using (true);
