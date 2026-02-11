-- Script de Atualização para Suporte a Filiais
-- Execute este script no Editor SQL do Supabase

-- 1. Adicionar coluna 'filial' na tabela de usuários
ALTER TABLE public.usuarios 
ADD COLUMN IF NOT EXISTS filial text;

-- 2. Adicionar coluna 'filial' na tabela de veículos (caso não exista)
ALTER TABLE public.veiculos 
ADD COLUMN IF NOT EXISTS filial text DEFAULT 'SP';

-- 3. Atualizar a função RPC de criação de usuários
-- Necessário para aceitar o novo parâmetro 'p_filial' enviado pelo front-end
CREATE OR REPLACE FUNCTION public.criar_novo_usuario(
    p_nome text,
    p_nomecompleto text,
    p_email text,
    p_nivel text,
    p_senha text,
    p_filial text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO public.usuarios (nome, nomecompleto, email, nivel, senha, filial)
    VALUES (p_nome, p_nomecompleto, p_email, p_nivel, p_senha, p_filial);
END;
$function$;

-- 4. VALIDAÇÃO: Encontrar placas "órfãs"
-- Execute esta consulta PRIMEIRO para ver quais placas existem nos lançamentos de manutenção,
-- mas não estão cadastradas na tabela de veículos.
-- Você precisa CADASTRAR ou CORRIGIR essas placas antes de prosseguir.
-- SELECT DISTINCT placa, COUNT(*) as total_lancamentos FROM public.coletas_manutencao WHERE placa NOT IN (SELECT placa FROM public.veiculos) GROUP BY placa ORDER BY placa;

-- AVISO: O passo 5 SÓ FUNCIONARÁ depois que a consulta acima não retornar nenhuma linha.
-- Se a consulta não retornar resultados, você pode prosseguir com segurança.

-- 5. Criar chave estrangeira entre Coletas e Veículos (agora deve funcionar)
-- Isso permite filtrar coletas pela filial do veículo usando !inner no Supabase
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_coletas_veiculos' AND table_name = 'coletas_manutencao') THEN
        ALTER TABLE public.coletas_manutencao
        ADD CONSTRAINT fk_coletas_veiculos FOREIGN KEY (placa) REFERENCES public.veiculos (placa) ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;