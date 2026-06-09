-- Historico de arquivos, reversao por lote e expurgo de duplicados de pedagios.
-- Execute este arquivo no SQL Editor do Supabase antes de usar a nova interface.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.pedagios_importacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid,
    filial text,
    arquivo_nome text NOT NULL,
    arquivo_caminho text NOT NULL,
    arquivo_tipo text,
    arquivo_tamanho bigint,
    usuario_id text,
    usuario_nome text,
    total_registros integer NOT NULL DEFAULT 0,
    total_rejeitados integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'PROCESSANDO',
    erro text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedagios_importacoes_status_check
        CHECK (status IN ('PROCESSANDO', 'CONCLUIDA', 'FALHA'))
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pedagios_importacoes'
          AND column_name = 'empresa_id'
          AND udt_name <> 'uuid'
    ) THEN
        ALTER TABLE public.pedagios_importacoes
            ALTER COLUMN empresa_id TYPE uuid
            USING nullif(trim(empresa_id::text), '')::uuid;
    END IF;
END $$;

ALTER TABLE public.pedagios_lancamentos
    ADD COLUMN IF NOT EXISTS importacao_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_pedagios_lancamentos_importacao'
          AND conrelid = 'public.pedagios_lancamentos'::regclass
    ) THEN
        ALTER TABLE public.pedagios_lancamentos
            ADD CONSTRAINT fk_pedagios_lancamentos_importacao
            FOREIGN KEY (importacao_id)
            REFERENCES public.pedagios_importacoes (id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pedagios_lancamentos_importacao
    ON public.pedagios_lancamentos (importacao_id);

CREATE INDEX IF NOT EXISTS idx_pedagios_importacoes_created_at
    ON public.pedagios_importacoes (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedagios_importacoes TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pedagios_lancamentos TO authenticated, anon;

CREATE INDEX IF NOT EXISTS idx_pedagios_lancamentos_duplicidade
    ON public.pedagios_lancamentos (
        empresa_id,
        placa,
        data_hora_passagem,
        valor,
        filial
    );

INSERT INTO storage.buckets (id, name, public)
VALUES ('pedagios_importacoes', 'pedagios_importacoes', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "pedagios_importacoes_select" ON storage.objects;
CREATE POLICY "pedagios_importacoes_select"
ON storage.objects FOR SELECT
TO authenticated, anon
USING (bucket_id = 'pedagios_importacoes');

DROP POLICY IF EXISTS "pedagios_importacoes_insert" ON storage.objects;
CREATE POLICY "pedagios_importacoes_insert"
ON storage.objects FOR INSERT
TO authenticated, anon
WITH CHECK (bucket_id = 'pedagios_importacoes');

DROP POLICY IF EXISTS "pedagios_importacoes_delete" ON storage.objects;
CREATE POLICY "pedagios_importacoes_delete"
ON storage.objects FOR DELETE
TO authenticated, anon
USING (bucket_id = 'pedagios_importacoes');

CREATE OR REPLACE FUNCTION public.pedagios_contar_duplicados()
RETURNS bigint
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
    WITH numerados AS (
        SELECT
            row_number() OVER (
                PARTITION BY
                    coalesce(trim(upper(empresa_id::text)), ''),
                    coalesce(regexp_replace(upper(placa), '[^A-Z0-9]', '', 'g'), ''),
                    data_hora_passagem,
                    round(coalesce(valor, 0)::numeric, 2),
                    coalesce(trim(upper(rodovia)), ''),
                    coalesce(trim(upper(praca)), ''),
                    coalesce(trim(upper(filial)), '')
                ORDER BY created_at NULLS LAST, id
            ) AS numero
        FROM public.pedagios_lancamentos
    )
    SELECT count(*)::bigint
    FROM numerados
    WHERE numero > 1;
$$;

CREATE OR REPLACE FUNCTION public.pedagios_expurgar_duplicados()
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    total_removido bigint;
BEGIN
    WITH numerados AS (
        SELECT
            id,
            row_number() OVER (
                PARTITION BY
                    coalesce(trim(upper(empresa_id::text)), ''),
                    coalesce(regexp_replace(upper(placa), '[^A-Z0-9]', '', 'g'), ''),
                    data_hora_passagem,
                    round(coalesce(valor, 0)::numeric, 2),
                    coalesce(trim(upper(rodovia)), ''),
                    coalesce(trim(upper(praca)), ''),
                    coalesce(trim(upper(filial)), '')
                ORDER BY created_at NULLS LAST, id
            ) AS numero
        FROM public.pedagios_lancamentos
    ),
    removidos AS (
        DELETE FROM public.pedagios_lancamentos p
        USING numerados n
        WHERE p.id = n.id
          AND n.numero > 1
        RETURNING p.id
    )
    SELECT count(*)::bigint INTO total_removido FROM removidos;

    RETURN total_removido;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pedagios_contar_duplicados() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.pedagios_expurgar_duplicados() TO authenticated, anon;
