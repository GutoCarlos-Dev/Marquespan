begin;

update public.escala
set filial = 'SP'
where filial is null
   or btrim(filial) = '';

update public.planejamento_semanal
set filial = 'SP'
where filial is null
   or btrim(filial) = '';

commit;

