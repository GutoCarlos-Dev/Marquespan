-- Atualiza a tabela usada pela pagina pedagio.html / script/pedagio.js.
-- Rode no SQL Editor do Supabase.
-- O script e idempotente: pode ser executado mais de uma vez.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.pedagios_lancamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    placa text,
    marca_veiculo text,
    categoria_eixos integer,
    data_hora_passagem timestamptz,
    empresa_id text,
    motorista text,
    rota text,
    rodovia text,
    praca text,
    valor numeric(12,2),
    usuario_id text,
    usuario_nome text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.pedagios_lancamentos
    ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS placa text,
    ADD COLUMN IF NOT EXISTS marca_veiculo text,
    ADD COLUMN IF NOT EXISTS categoria_eixos integer,
    ADD COLUMN IF NOT EXISTS data_hora_passagem timestamptz,
    ADD COLUMN IF NOT EXISTS empresa_id text,
    ADD COLUMN IF NOT EXISTS motorista text,
    ADD COLUMN IF NOT EXISTS rota text,
    ADD COLUMN IF NOT EXISTS rodovia text,
    ADD COLUMN IF NOT EXISTS praca text,
    ADD COLUMN IF NOT EXISTS valor numeric(12,2),
    ADD COLUMN IF NOT EXISTS usuario_id text,
    ADD COLUMN IF NOT EXISTS usuario_nome text,
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pedagios_lancamentos'
          AND column_name = 'id'
          AND udt_name = 'uuid'
    ) THEN
        UPDATE public.pedagios_lancamentos
        SET id = gen_random_uuid()
        WHERE id IS NULL;

        ALTER TABLE public.pedagios_lancamentos
            ALTER COLUMN id SET DEFAULT gen_random_uuid(),
            ALTER COLUMN id SET NOT NULL;
    END IF;
END $$;

ALTER TABLE public.pedagios_lancamentos
    DROP CONSTRAINT IF EXISTS fk_pedagios_lancamentos_empresa;

-- Nao alteramos o tipo de usuario_id aqui porque essa coluna pode estar
-- vinculada a policies RLS existentes no Supabase.
-- Se a coluna ja existe, mantenha o tipo atual dela.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.pedagios_lancamentos'::regclass
          AND contype = 'p'
    )
    AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pedagios_lancamentos'
          AND column_name = 'id'
    ) THEN
        ALTER TABLE public.pedagios_lancamentos
            ADD CONSTRAINT pedagios_lancamentos_pkey PRIMARY KEY (id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pedagios_lancamentos_categoria_eixos_check'
          AND conrelid = 'public.pedagios_lancamentos'::regclass
    ) THEN
        ALTER TABLE public.pedagios_lancamentos
            ADD CONSTRAINT pedagios_lancamentos_categoria_eixos_check
            CHECK (categoria_eixos IS NULL OR categoria_eixos > 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pedagios_lancamentos_valor_check'
          AND conrelid = 'public.pedagios_lancamentos'::regclass
    ) THEN
        ALTER TABLE public.pedagios_lancamentos
            ADD CONSTRAINT pedagios_lancamentos_valor_check
            CHECK (valor IS NULL OR valor >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'veiculos'
          AND column_name = 'placa'
    )
    AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_pedagios_lancamentos_placa'
          AND conrelid = 'public.pedagios_lancamentos'::regclass
    ) THEN
        ALTER TABLE public.pedagios_lancamentos
            ADD CONSTRAINT fk_pedagios_lancamentos_placa
            FOREIGN KEY (placa)
            REFERENCES public.veiculos (placa)
            ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pedagios_lancamentos_data
    ON public.pedagios_lancamentos (data_hora_passagem DESC);

CREATE INDEX IF NOT EXISTS idx_pedagios_lancamentos_placa
    ON public.pedagios_lancamentos (placa);

CREATE INDEX IF NOT EXISTS idx_pedagios_lancamentos_empresa
    ON public.pedagios_lancamentos (empresa_id);

CREATE INDEX IF NOT EXISTS idx_pedagios_lancamentos_motorista
    ON public.pedagios_lancamentos (motorista);

CREATE INDEX IF NOT EXISTS idx_pedagios_lancamentos_rota
    ON public.pedagios_lancamentos (rota);
