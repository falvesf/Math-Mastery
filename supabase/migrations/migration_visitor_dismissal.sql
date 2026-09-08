-- ============================================================
-- Sistema de Visitas do Professor: suporte ao "Dar Tchau"
-- Adiciona a coluna visitor_dismissal (JSONB) na tabela users,
-- usada para registrar quando o aluno dispensou um professor
-- visitante e aguardar o cooldown de 1 dia para o retorno.
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS visitor_dismissal jsonb;