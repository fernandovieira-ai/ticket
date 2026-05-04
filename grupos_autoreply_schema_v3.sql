-- =============================================================================
-- DigitalRF Help - Schema: Auto-Resposta WhatsApp + OpenAI
-- Versao: 3.0  -  ajustado para banco com encoding LATIN1 (ISO-8859-1)
--
-- PROBLEMA:
--   Banco em LATIN1 -> texto com acentos (c, a, o, a...) e armazenado em
--   ISO-8859-1. Se enviado direto para a OpenAI (que espera UTF-8), os
--   caracteres chegam corrompidos e o embedding gerado e inutil.
--
-- SOLUCAO ADOTADA:
--   1. Colunas de texto com COLLATE "C" para evitar conflito de collation
--      em comparacoes entre strings de origens diferentes.
--   2. Funcao sanitizar_para_embedding() que converte latin1->utf8 em SQL
--      e remove caracteres problematicos antes de enviar a OpenAI.
--   3. O backend SEMPRE chama sanitizar_para_embedding() antes de gerar
--      o embedding - nunca manda o texto cru da tabela direto.
--   4. Colunas TEXT armazenam normalmente em latin1 - sem mudar o banco.
-- =============================================================================


-- =============================================================================
-- 1. BASE DE CONHECIMENTO Q&A  (grupos_qa_base)
-- =============================================================================

CREATE TABLE IF NOT EXISTS grupos_qa_base (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- COLLATE "C": evita erro de collation ao comparar com strings vindas
  -- de conexoes UTF-8 (ex: Next.js / Node com client_encoding=UTF8)
  categoria             TEXT        COLLATE "C"  NOT NULL,
  pergunta_exemplo      TEXT        COLLATE "C"  NOT NULL,
  resposta_template     TEXT        COLLATE "C"  NOT NULL,
  tags                  TEXT[]                   DEFAULT '{}',

  -- Embedding OpenAI gerado a partir do texto JA CONVERTIDO para UTF-8
  embedding_pergunta    float8[],
  embedding_modelo      TEXT        COLLATE "C"  DEFAULT 'text-embedding-3-small',
  embedding_gerado_at   TIMESTAMPTZ,

  -- Versionamento
  versao                INTEGER      NOT NULL DEFAULT 1,
  versao_anterior_id    UUID         REFERENCES grupos_qa_base(id),

  -- Origem
  origem                TEXT        COLLATE "C"  NOT NULL DEFAULT 'manual',
  grupo_origem_id       TEXT        COLLATE "C",
  mensagem_cliente_id   TEXT        COLLATE "C",
  mensagem_operador_id  TEXT        COLLATE "C",
  extracao_confianca    TEXT        COLLATE "C"  DEFAULT 'media',

  -- Aprovacao humana
  aprovado              BOOLEAN      NOT NULL DEFAULT FALSE,
  aprovado_por          TEXT        COLLATE "C",
  aprovado_at           TIMESTAMPTZ,
  motivo_rejeicao       TEXT        COLLATE "C",

  -- Metricas e feedback loop
  usos_total            INTEGER      NOT NULL DEFAULT 0,
  acertos               INTEGER      NOT NULL DEFAULT 0,
  erros                 INTEGER      NOT NULL DEFAULT 0,
  sem_retorno           INTEGER      NOT NULL DEFAULT 0,
  score_confianca       FLOAT GENERATED ALWAYS AS (
                          CASE WHEN (acertos + erros) = 0 THEN NULL
                               ELSE acertos::float / (acertos + erros)
                          END
                        ) STORED,

  ativo                 BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_aprovado_ativo   ON grupos_qa_base (aprovado, ativo);
CREATE INDEX IF NOT EXISTS idx_qa_categoria        ON grupos_qa_base (categoria);
CREATE INDEX IF NOT EXISTS idx_qa_score            ON grupos_qa_base (score_confianca DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_qa_com_embedding    ON grupos_qa_base (id)
  WHERE embedding_pergunta IS NOT NULL;

COMMENT ON TABLE grupos_qa_base IS
  'Pares Q&A aprovados. Banco em LATIN1: texto armazenado em ISO-8859-1.
   Embeddings gerados a partir de texto convertido para UTF-8 via sanitizar_para_embedding().';


-- =============================================================================
-- 2. FILA DE APROVACAO  (grupos_qa_pendentes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS grupos_qa_pendentes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  categoria_sugerida    TEXT        COLLATE "C",
  pergunta_original     TEXT        COLLATE "C"  NOT NULL,
  resposta_original     TEXT        COLLATE "C"  NOT NULL,
  pergunta_editada      TEXT        COLLATE "C",
  resposta_editada      TEXT        COLLATE "C",

  grupo_id              TEXT        COLLATE "C"  NOT NULL,
  mensagem_cliente_id   TEXT        COLLATE "C",
  mensagem_operador_id  TEXT        COLLATE "C",
  delta_minutos         INTEGER,
  confianca_extracao    TEXT        COLLATE "C"  DEFAULT 'media',

  status                TEXT        COLLATE "C"  NOT NULL DEFAULT 'pendente',
  revisado_por          TEXT        COLLATE "C",
  revisado_at           TIMESTAMPTZ,
  motivo_rejeicao       TEXT        COLLATE "C",
  qa_base_id            UUID        REFERENCES grupos_qa_base(id),

  criado_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pendentes_status ON grupos_qa_pendentes (status, criado_at DESC);
CREATE INDEX IF NOT EXISTS idx_pendentes_grupo  ON grupos_qa_pendentes (grupo_id);


-- =============================================================================
-- 3. CONFIGURACAO POR GRUPO
-- =============================================================================

ALTER TABLE whatsapp_grupos
  ADD COLUMN IF NOT EXISTS autoreply_ativo          BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS autoreply_threshold      FLOAT     DEFAULT 0.82,
  ADD COLUMN IF NOT EXISTS autoreply_delay_seg      INTEGER   DEFAULT 8,
  ADD COLUMN IF NOT EXISTS autoreply_categorias     TEXT[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS autoreply_excluir_grupo  BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS autoreply_horario_inicio TIME      DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS autoreply_horario_fim    TIME      DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS autoreply_max_por_hora   INTEGER   DEFAULT 10;

UPDATE whatsapp_grupos
SET autoreply_excluir_grupo = TRUE
WHERE id::TEXT = '43231026';
-- Se a coluna id ja for TEXT/VARCHAR, use apenas: WHERE id = '43231026'
-- Se for UUID, o grupo_id do WhatsApp provavelmente esta em outra coluna (ex: grupo_id, waid)


-- =============================================================================
-- 4. LOG DE INTERACOES
-- =============================================================================

ALTER TABLE whatsapp_grupos_interacoes
  ADD COLUMN IF NOT EXISTS ia_auto_respondido     BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ia_qa_id               UUID        REFERENCES grupos_qa_base(id),
  ADD COLUMN IF NOT EXISTS ia_score               FLOAT,
  ADD COLUMN IF NOT EXISTS ia_modelo_embedding    TEXT        COLLATE "C",
  ADD COLUMN IF NOT EXISTS ia_resposta_enviada    TEXT        COLLATE "C",
  ADD COLUMN IF NOT EXISTS ia_enviado_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ia_feedback            TEXT        COLLATE "C",
  ADD COLUMN IF NOT EXISTS ia_feedback_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ia_escalado_por        TEXT        COLLATE "C";

CREATE INDEX IF NOT EXISTS idx_interacoes_ia
  ON whatsapp_grupos_interacoes (ia_auto_respondido, ia_enviado_at DESC)
  WHERE ia_auto_respondido = TRUE;


-- =============================================================================
-- 5. FUNCAO: Sanitizar texto latin1 antes de gerar embedding
-- =============================================================================
-- Converte o texto armazenado em LATIN1 para uma representacao limpa,
-- substituindo caracteres acentuados pelos equivalentes ASCII.
-- Isso garante que o texto enviado a OpenAI seja consistente e sem
-- caracteres corrompidos independente do encoding da conexao.
--
-- USE ESTA FUNCAO no backend antes de qualquer chamada a OpenAI:
--   SELECT sanitizar_para_embedding(pergunta_exemplo) FROM grupos_qa_base WHERE id = $1
-- =============================================================================

CREATE OR REPLACE FUNCTION sanitizar_para_embedding(texto TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT
    -- Remove caracteres de controle e nulos
    regexp_replace(
      -- Normaliza espacos multiplos
      regexp_replace(
        -- Substitui acentos e caracteres especiais do portugues
        translate(
          texto,
          -- latin1: caracteres originais
          'aaaaaaaeceeeeiiiidnooooouuuuyyAAAAAAAECEEEEIIIINOOOOOUUUUY',
          -- ASCII: equivalentes sem acento
          'aaaaaaaceeeeiiiidnoooooouuuuyyAAAAAAACEEEEIIIINOOOOOUUUUY'
        ),
        '\s+', ' ', 'g'         -- normaliza espacos
      ),
      '[[:cntrl:]]', '', 'g'    -- remove controles (\r, \n interno, \t etc)
    );
$$;

COMMENT ON FUNCTION sanitizar_para_embedding IS
  'Converte texto latin1 -> ASCII limpo para envio a OpenAI.
   Substitui acentos portugueses, remove controles e normaliza espacos.
   SEMPRE usar antes de gerar embedding via API.';


-- =============================================================================
-- 6. FUNCAO: Texto limpo para exibicao UTF-8
-- =============================================================================
-- Separada da sanitizacao de embedding - esta preserva os acentos,
-- apenas limpa caracteres invalidos. Usar ao retornar texto para o frontend.
-- =============================================================================

CREATE OR REPLACE FUNCTION limpar_latin1(texto TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT
    regexp_replace(
      regexp_replace(texto, '[[:cntrl:]]', '', 'g'),  -- remove controles
      '\s+', ' ', 'g'                                  -- normaliza espacos
    );
$$;

COMMENT ON FUNCTION limpar_latin1 IS
  'Limpa texto latin1 para exibicao: remove caracteres de controle e espacos duplos.
   Preserva acentos. Usar ao retornar texto para o frontend Next.js.';


-- =============================================================================
-- 7. FUNCAO: Similaridade de cosseno entre float8[]
-- =============================================================================

CREATE OR REPLACE FUNCTION cosseno_similaridade(a float8[], b float8[])
RETURNS float8
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT
    (SELECT SUM(v) FROM (SELECT unnest(a) * unnest(b) AS v) t)
    /
    NULLIF(
      sqrt((SELECT SUM(v*v) FROM unnest(a) AS v))
      *
      sqrt((SELECT SUM(v*v) FROM unnest(b) AS v)),
      0
    );
$$;


-- =============================================================================
-- 8. FUNCAO: Busca semantica
-- =============================================================================

CREATE OR REPLACE FUNCTION buscar_qa_similar(
  p_embedding   float8[],
  p_categoria   TEXT    DEFAULT NULL,
  p_limite      INTEGER DEFAULT 3
)
RETURNS TABLE (
  id                UUID,
  categoria         TEXT,
  pergunta_exemplo  TEXT,
  resposta_template TEXT,
  score_similitude  FLOAT,
  score_confianca   FLOAT,
  versao            INTEGER
)
LANGUAGE sql STABLE
AS $$
  SELECT
    q.id,
    limpar_latin1(q.categoria)::TEXT,
    limpar_latin1(q.pergunta_exemplo)::TEXT,
    limpar_latin1(q.resposta_template)::TEXT,
    cosseno_similaridade(q.embedding_pergunta, p_embedding)::FLOAT,
    q.score_confianca,
    q.versao
  FROM grupos_qa_base q
  WHERE
    q.aprovado = TRUE
    AND q.ativo = TRUE
    AND q.embedding_pergunta IS NOT NULL
    AND (p_categoria IS NULL OR q.categoria = p_categoria)
    AND (q.score_confianca IS NULL OR q.score_confianca >= 0.4)
  ORDER BY cosseno_similaridade(q.embedding_pergunta, p_embedding) DESC NULLS LAST
  LIMIT p_limite;
$$;

-- Aplicar threshold no backend apos receber resultados:
--   rows.filter(r => r.score_similitude >= grupo.autoreply_threshold)

COMMENT ON FUNCTION buscar_qa_similar IS
  'Busca Q&A por similaridade de cosseno (float8[]).
   Retorna textos ja passados por limpar_latin1() para o frontend.
   Threshold aplicado no backend. Full scan - adequado ate ~5.000 pares.';


-- =============================================================================
-- 9. FUNCAO: Atualizar score apos feedback
-- =============================================================================

CREATE OR REPLACE FUNCTION atualizar_score_qa(
  p_qa_id    UUID,
  p_feedback TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE grupos_qa_base
  SET
    usos_total  = usos_total + 1,
    acertos     = CASE WHEN p_feedback = 'resolvido'
                       THEN acertos + 1 ELSE acertos END,
    erros       = CASE WHEN p_feedback IN ('escalado', 'nao_resolvido')
                       THEN erros + 1 ELSE erros END,
    sem_retorno = CASE WHEN p_feedback = 'sem_retorno'
                       THEN sem_retorno + 1 ELSE sem_retorno END,
    atualizado_at = NOW()
  WHERE id = p_qa_id;
END;
$$;


-- =============================================================================
-- 10. TRIGGER: atualizado_at automatico
-- =============================================================================

CREATE OR REPLACE FUNCTION _set_atualizado_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qa_base_atualizado_at ON grupos_qa_base;
CREATE TRIGGER trg_qa_base_atualizado_at
  BEFORE UPDATE ON grupos_qa_base
  FOR EACH ROW EXECUTE FUNCTION _set_atualizado_at();


-- =============================================================================
-- 11. VIEWS DE MONITORAMENTO
-- =============================================================================

CREATE OR REPLACE VIEW vw_autoreply_performance AS
SELECT
  categoria,
  COUNT(*)                                                                AS total_pares,
  SUM(usos_total)                                                         AS usos_total,
  SUM(acertos)                                                            AS acertos,
  SUM(erros)                                                              AS erros,
  SUM(sem_retorno)                                                        AS sem_retorno,
  ROUND(AVG(score_confianca) FILTER (WHERE score_confianca IS NOT NULL)::NUMERIC, 3) AS score_medio,
  COUNT(*) FILTER (WHERE score_confianca < 0.6 AND usos_total >= 5)      AS pares_para_revisar
FROM grupos_qa_base
WHERE aprovado = TRUE AND ativo = TRUE
GROUP BY categoria
ORDER BY usos_total DESC;

CREATE OR REPLACE VIEW vw_qa_para_revisar AS
SELECT
  id,
  limpar_latin1(categoria)       AS categoria,
  limpar_latin1(pergunta_exemplo) AS pergunta_exemplo,
  limpar_latin1(resposta_template) AS resposta_template,
  usos_total, acertos, erros, score_confianca, versao, atualizado_at
FROM grupos_qa_base
WHERE
  aprovado = TRUE AND ativo = TRUE
  AND usos_total >= 5
  AND (score_confianca < 0.60 OR erros >= 3)
ORDER BY score_confianca ASC NULLS LAST, erros DESC;


-- =============================================================================
-- 12. SEED - 10 pares para fila de aprovacao
-- =============================================================================
-- Inseridos sem acentos para compatibilidade com LATIN1.
-- Os textos completos com acentos devem ser inseridos via backend Node.js
-- usando client_encoding=LATIN1 ou convertendo antes do INSERT.
-- =============================================================================

INSERT INTO grupos_qa_pendentes
  (categoria_sugerida, pergunta_original, resposta_original, grupo_id, confianca_extracao)
VALUES
  ('App Linx',
   'Pix trava ao finalizar venda / nota presa / nao consigo virar o caixa',
   'Desconectar do WiFi, reconectar, abrir o App Linx e repetir a operacao. Se persistir, fechar e reabrir o app.',
   'seed', 'alta'),

  ('NFe',
   'Nota fiscal cancelada e nao voltou para a tela',
   'Tira foto da tela inteira e transmite pelo gerencial.',
   'seed', 'alta'),

  ('NFe',
   'POS dando erro (codigo na tela)',
   'Seleciona as notas com erro e clica em reprocessar.',
   'seed', 'alta'),

  ('NFe',
   'Notas nao saindo / nao esta saindo nem uma nota',
   'Seleciona essas notas e clica em reprocessar.',
   'seed', 'alta'),

  ('Sistema',
   'Sistema caindo / ja reiniciei varias vezes',
   'Desliga a automacao, aguarda uns minutos e religa.',
   'seed', 'alta'),

  ('TEF/PIX',
   'Pix com instabilidade geral / todas as vendas com problema',
   'Problema de internet local. Teste primeiro com dinheiro e informe se resolve.',
   'seed', 'alta'),

  ('TEF',
   'Erro so quando passa no TEF / somente ao passar cartao',
   'O erro acontece em todas as maquinas ou so em uma especifica?',
   'seed', 'media'),

  ('ERP',
   'Log do emsys / negociacao apagada',
   'Precisamos entender o que ocorreu. Pode me enviar o log completo?',
   'seed', 'media'),

  ('Preco',
   'Pix nao esta dando desconto',
   'Vou verificar junto ao setor responsavel pelos precos. Um momento.',
   'seed', 'media'),

  ('Sistema',
   'Usuario nao estava logado no sistema',
   'Faca o login normalmente. Se tiver atualizacao pendente, aplicar antes de continuar.',
   'seed', 'alta');


-- =============================================================================
-- CHECKLIST DE CONFIGURACAO DO BACKEND (Node.js / Next.js)
-- =============================================================================
--
-- 1. Na conexao pg, definir encoding explicitamente:
--      const pool = new Pool({
--        connectionString: process.env.DATABASE_URL,
--        options: '-c client_encoding=LATIN1'   // <- essencial
--      })
--
-- 2. Antes de gerar embedding, sempre buscar o texto sanitizado:
--      const { rows } = await pool.query(
--        'SELECT sanitizar_para_embedding(pergunta_exemplo) AS texto FROM grupos_qa_base WHERE id = $1',
--        [id]
--      )
--      const textoParaEmbedding = rows[0].texto  // ASCII limpo -> OpenAI
--
-- 3. Para exibir texto no frontend (com acentos):
--      SELECT limpar_latin1(pergunta_exemplo) AS pergunta FROM grupos_qa_base
--      -- ou usar buscar_qa_similar() que ja aplica limpar_latin1()
--
-- 4. Para inserir novos pares via backend:
--      Opcao A - enviar texto puro (com acentos), o Postgres converte:
--        await pool.query('INSERT INTO grupos_qa_base (pergunta_exemplo, ...) VALUES ($1, ...)', [texto])
--        // Funciona se client_encoding=LATIN1 estiver configurado
--
--      Opcao B - sanitizar antes no JS:
--        const textoLimpo = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
--        await pool.query('INSERT INTO grupos_qa_base (pergunta_exemplo, ...) VALUES ($1, ...)', [textoLimpo])
--
-- =============================================================================
-- FIM DO SCHEMA v3
-- =============================================================================
