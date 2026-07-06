-- Permite que usuarios com permissao de abastecimento vinculem QR Code ao veiculo
-- sem liberar edicao geral da tabela public.veiculos.
-- Execute no SQL Editor do Supabase.

create or replace function public.vincular_qrcode_veiculo(
  p_placa text,
  p_qrcode text,
  p_filiais text[] default null
)
returns table (placa text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placa text := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
  v_qrcode text := nullif(trim(coalesce(p_qrcode, '')), '');
begin
  if not (
    public.usuario_pode_lancar_abastecimento()
    or public.usuario_pode_editar_veiculos()
  ) then
    raise exception 'Usuario sem permissao para vincular QR Code de veiculo.'
      using errcode = '42501';
  end if;

  return query
    update public.veiculos v
       set qrcode = v_qrcode
     where upper(regexp_replace(coalesce(v.placa, ''), '[^A-Za-z0-9]', '', 'g')) = v_placa
       and (
         coalesce(array_length(p_filiais, 1), 0) = 0
         or v.filial = any(p_filiais)
       )
     returning v.placa;
end;
$$;

grant execute on function public.vincular_qrcode_veiculo(text, text, text[]) to authenticated;
