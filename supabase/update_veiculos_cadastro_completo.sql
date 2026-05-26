-- Atualiza a tabela usada pela pagina veiculos.html / script/veiculos.js.
-- Execute este arquivo no SQL Editor do Supabase antes de usar o novo cadastro completo.

ALTER TABLE public.veiculos
    ADD COLUMN IF NOT EXISTS numero_crv text,
    ADD COLUMN IF NOT EXISTS modelo_versao text,
    ADD COLUMN IF NOT EXISTS especie text,
    ADD COLUMN IF NOT EXISTS combustivel text,
    ADD COLUMN IF NOT EXISTS potencia_cilindrada text,
    ADD COLUMN IF NOT EXISTS motor text,
    ADD COLUMN IF NOT EXISTS carroceria text,
    ADD COLUMN IF NOT EXISTS local_emplacamento text,
    ADD COLUMN IF NOT EXISTS observacoes_veiculo text,
    ADD COLUMN IF NOT EXISTS tanque_combustivel_1 numeric,
    ADD COLUMN IF NOT EXISTS tanque_combustivel_2 numeric,
    ADD COLUMN IF NOT EXISTS tara_veiculo numeric,
    ADD COLUMN IF NOT EXISTS capacidade_carga numeric,
    ADD COLUMN IF NOT EXISTS tacografo_tipo text,
    ADD COLUMN IF NOT EXISTS tacografo_marca text,
    ADD COLUMN IF NOT EXISTS video_monitoramento boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS cobranca_automatica_pedagio boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS categoria_cobranca text,
    ADD COLUMN IF NOT EXISTS motor_tk text,
    ADD COLUMN IF NOT EXISTS compressor_tk text,
    ADD COLUMN IF NOT EXISTS marca_implemento text,
    ADD COLUMN IF NOT EXISTS mes_ano_fabricacao text,
    ADD COLUMN IF NOT EXISTS foto_dianteira_url text,
    ADD COLUMN IF NOT EXISTS foto_traseira_url text,
    ADD COLUMN IF NOT EXISTS foto_lateral_1_url text,
    ADD COLUMN IF NOT EXISTS foto_lateral_2_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('veiculos_fotos', 'veiculos_fotos', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'veiculos_fotos_select'
    ) THEN
        CREATE POLICY veiculos_fotos_select
        ON storage.objects FOR SELECT
        USING (bucket_id = 'veiculos_fotos');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'veiculos_fotos_insert'
    ) THEN
        CREATE POLICY veiculos_fotos_insert
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'veiculos_fotos');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'veiculos_fotos_update'
    ) THEN
        CREATE POLICY veiculos_fotos_update
        ON storage.objects FOR UPDATE
        USING (bucket_id = 'veiculos_fotos')
        WITH CHECK (bucket_id = 'veiculos_fotos');
    END IF;
END $$;
