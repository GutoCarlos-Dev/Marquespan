-- Script para corrigir o nome da filial nos postos cadastrados
-- Atualiza de "Marquespan Sao Paulo" para "Matriz SP"

UPDATE public.postos
SET filial = 'Matriz SP'
WHERE filial = 'Marquespan Sao Paulo';