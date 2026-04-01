-- ============================================================
-- Migração v1.11 — Base de conhecimento para resolução de grupos
-- 01/04/2026
-- Usa float8[] nativo do PostgreSQL para armazenar embeddings.
-- A similaridade de cosseno é calculada na aplicação (Node.js),
-- eliminando a dependência da extensão pgvector.
-- ============================================================

-- Tabela da base de conhecimento
-- empresa_id NULL = padrão global do sistema (aplicado a todas as empresas)
CREATE TABLE IF NOT EXISTS grupos_resolucao_base (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID         REFERENCES empresas(id) ON DELETE CASCADE,
  conteudo      TEXT         NOT NULL,                          -- frase/exemplo de referência
  tipo          TEXT         NOT NULL
                             CHECK (tipo IN ('resolucao', 'abandono', 'pendente')),
  embedding     float8[],                                       -- vetor 1536 dims, gerado via text-embedding-3-small
  ativo         BOOLEAN      NOT NULL DEFAULT TRUE,
  origem        TEXT         NOT NULL DEFAULT 'manual'
                             CHECK (origem IN ('manual', 'ia_aprendizado')),
  criado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índice convencional para filtros de empresa/ativo
CREATE INDEX IF NOT EXISTS idx_resolucao_base_empresa
  ON grupos_resolucao_base(empresa_id, ativo);

-- ============================================================
-- SEED — frases de referência (embeddings gerados via rota de seed)
-- ============================================================

INSERT INTO grupos_resolucao_base (empresa_id, conteudo, tipo) VALUES
  -- RESOLUÇÃO: agradecimentos e confirmação
  (NULL, 'obrigado, resolveu',                         'resolucao'),
  (NULL, 'valeu, deu certo',                           'resolucao'),
  (NULL, 'muito obrigado, funcionou',                  'resolucao'),
  (NULL, 'grato, problema resolvido',                  'resolucao'),
  (NULL, 'perfeito, consegui resolver',                'resolucao'),
  (NULL, 'tudo certo, já funciona',                    'resolucao'),
  (NULL, 'pode fechar, resolvemos',                    'resolucao'),
  (NULL, 'entendido, vou verificar e retorno',         'resolucao'),
  (NULL, 'ok, consegui acessar agora',                 'resolucao'),
  (NULL, 'já corrigi aqui, obrigado',                  'resolucao'),
  (NULL, 'resolveu sim, valeu pelo suporte',           'resolucao'),
  (NULL, 'tá funcionando agora, brigado',              'resolucao'),
  -- RESOLUÇÃO: confirmação indireta
  (NULL, 'não precisa mais, já consegui',              'resolucao'),
  (NULL, 'foi, vlw tmj',                               'resolucao'),
  (NULL, 'deu bom, conseguimos aqui',                  'resolucao'),
  (NULL, 'pode encerrar o chamado',                    'resolucao'),
  (NULL, 'já resolvi por conta',                       'resolucao'),
  -- ABANDONO: cliente desistiu / não precisa mais
  (NULL, 'deixa, não preciso mais',                    'abandono'),
  (NULL, 'esquece, vou fazer de outro jeito',          'abandono'),
  (NULL, 'pode ignorar, já não é necessário',          'abandono'),
  (NULL, 'deixa pra lá, depois eu vejo',               'abandono'),
  (NULL, 'desistimos, vamos cancelar',                 'abandono'),
  -- PENDENTE: cliente ainda aguarda resposta
  (NULL, 'alguém pode me ajudar, ainda aguardando',    'pendente'),
  (NULL, 'ninguém respondeu ainda, urgente',           'pendente'),
  (NULL, 'continua com erro, não consegui resolver',   'pendente'),
  (NULL, 'preciso de suporte, está bloqueado',         'pendente'),
  (NULL, 'não funciona ainda, qual o prazo',           'pendente'),
  (NULL, 'ainda esperando retorno',                    'pendente'),
  (NULL, 'quando alguém pode olhar isso',              'pendente'),
  (NULL, 'segue parado, preciso de ajuda',             'pendente')
ON CONFLICT DO NOTHING;
