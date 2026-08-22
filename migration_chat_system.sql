-- ============================================================
-- MIGRAÇÃO: CHAT + AMIGOS + PRESENÇA
-- Descrição:
--   1. Tabela chat_messages (mensagens entre usuários)
--   2. Tabela chat_conversations (metadados de conversa + não-lidos)
--   3. Tabela user_friends (lista de contatos)
--   4. Coluna last_seen_at em users (presença/heartbeat)
--   5. Índices para consultas
-- ============================================================

-- 1) Mensagens
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  tenant_id UUID
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_pair ON chat_messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_recipient ON chat_messages (recipient_id, read_at);

-- 2) Conversas (controle de não-lidos)
CREATE TABLE IF NOT EXISTS chat_conversations (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  peer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unread_count INTEGER DEFAULT 0,
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, peer_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations (user_id, updated_at DESC);

-- 3) Amigos / contatos
CREATE TABLE IF NOT EXISTS user_friends (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_id)
);
CREATE INDEX IF NOT EXISTS idx_user_friends_user ON user_friends (user_id);
CREATE INDEX IF NOT EXISTS idx_user_friends_friend ON user_friends (friend_id);

-- 4) Presença: coluna de última atividade em users
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- 5) RLS desabilitado (padrão do projeto: isolamento no nível da aplicação)
ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_friends DISABLE ROW LEVEL SECURITY;

-- 6) REGISTRAR TABELAS NA PUBLICAÇÃO REALTIME
-- CRÍTICO: sem isso, o postgres_changes NÃO notifica o cliente em tempo real.
-- Idempotente: só adiciona se a tabela ainda não for membro da publicação.
DO $$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['chat_messages', 'chat_conversations', 'user_friends'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
      END IF;
    END LOOP;
  END IF;
END $$;