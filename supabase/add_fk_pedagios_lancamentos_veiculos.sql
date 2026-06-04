-- Adiciona uma chave estrangeira na tabela 'pedagios_lancamentos'
-- para referenciar a tabela 'veiculos' através da coluna 'placa'.
-- Isso permitirá que o PostgREST (Supabase) infira a relação
-- e execute corretamente as consultas com joins implícitos.

ALTER TABLE public.pedagios_lancamentos
ADD CONSTRAINT fk_pedagios_lancamentos_placa
FOREIGN KEY (placa)
REFERENCES public.veiculos (placa)
ON UPDATE CASCADE
ON DELETE RESTRICT; -- 'ON DELETE RESTRICT' impede a exclusão de um veículo se houver lançamentos de pedágio associados.
