-- Remove políticas restritivas anteriores que exigiam autenticação do Supabase
DROP POLICY IF EXISTS "Acesso total mapa_rotas" ON public.mapa_rotas;
DROP POLICY IF EXISTS "Acesso total mapa_pontos" ON public.mapa_pontos;

-- Cria novas políticas públicas (permissivas) para permitir acesso pelo sistema
-- Isso resolve o erro 401/RLS violation
CREATE POLICY "Acesso total mapa_rotas publico" ON public.mapa_rotas
FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Acesso total mapa_pontos publico" ON public.mapa_pontos
FOR ALL USING (true) WITH CHECK (true);

-- Execute este script no SQL Editor do Supabase.