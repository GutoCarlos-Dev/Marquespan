-- Sobra de Caixas sem Cliente — aba "Sobra" no modal "Lançar Retorno de Produtos"
-- (retorno-rota-mobile.html). Motivo é sempre fixo "Sobra de Carga" (não precisa de coluna,
-- é só um texto fixo mostrado na tela e na mensagem de WhatsApp).
-- Execute no SQL Editor do Supabase.

alter table public.retorno_rota
  add column if not exists sobra_frances_diurno integer,
  add column if not exists sobra_frances_noturno integer,
  add column if not exists sobra_variedades text,
  add column if not exists sobra_obs text;

notify pgrst, 'reload schema';
