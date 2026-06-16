-- Permite cadastrar rotas sem informar responsavel.
-- O campo deixou de ser obrigatorio na tela rotas.html.
ALTER TABLE public.rotas
  ALTER COLUMN responsavel DROP NOT NULL;
