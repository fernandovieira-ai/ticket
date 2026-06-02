import { Pool, PoolClient } from 'pg';

// Pool drfweb (intranet original — contratos, etc.)
const dbDrfweb = new Pool({
  host: process.env.DRFWEB_HOST ?? 'cloud.digitalrf.com.br',
  database: process.env.DRFWEB_DB ?? 'drfweb',
  user: process.env.DRFWEB_USER ?? 'drfweb',
  password: process.env.DRFWEB_PASS ?? 'ASf5S6g7d6d0s',
  port: parseInt(process.env.DRFWEB_PORT ?? '5432'),
  ssl: false,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 8000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
});

// Pool unificado (drfticket com schemas public + intranet)
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 8000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  allowExitOnIdle: false,
  options: "--statement_timeout=10000",
});

// Previne crash do processo em erros de pool
db.on("error", (err) => {
  console.error("[db-unified] Pool error:", err.message);
});

dbDrfweb.on("error", (err) => {
  console.error("[dbDrfweb] Pool error:", err.message);
});

/** Erros transitórios que valem uma nova tentativa */
const RETRYABLE = [
  "Connection terminated unexpectedly",
  "Connection terminated due to connection timeout",
  "ECONNRESET",
  "ETIMEDOUT",
  "the database system is starting up",
  "too many connections",
];

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE.some((s) => msg.includes(s));
}

/**
 * Executa um callback que recebe um PoolClient com retry automático.
 * Em caso de erro transitório, retenta até 3 vezes com backoff exponencial.
 */
async function withConnection<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
  attempt = 1,
): Promise<T> {
  const client = await pool.connect();
  try {
    const result = await fn(client);
    client.release(); // conexão boa → devolve ao pool
    return result;
  } catch (err) {
    // Destrói a conexão problemática em vez de reciclá-la
    client.release(err instanceof Error ? err : new Error(String(err)));
    if (isRetryable(err) && attempt <= 3) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
      return withConnection(pool, fn, attempt + 1);
    }
    throw err;
  }
}

export async function queryDrfweb(text: string, params?: any[]) {
  return withConnection(dbDrfweb, async (client) => {
    return await client.query(text, params);
  });
}

// Função principal para consultas no banco unificado (schema public)
export async function query(text: string, params?: any[]) {
  return withConnection(db, async (client) => {
    return await client.query(text, params);
  });
}

// Função para consultas na intranet (schema intranet)
export async function queryIntranet(text: string, params?: any[]) {
  // Se a query já inclui o schema intranet, use como está
  // Caso contrário, adicione o prefixo intranet. automaticamente
  const finalText = text.includes('intranet.') ? text :
                   text.replace(/FROM\s+(\w+)/gi, 'FROM intranet.$1')
                        .replace(/INTO\s+(\w+)/gi, 'INTO intranet.$1')
                        .replace(/UPDATE\s+(\w+)/gi, 'UPDATE intranet.$1')
                        .replace(/DELETE\s+FROM\s+(\w+)/gi, 'DELETE FROM intranet.$1');

  return withConnection(db, async (client) => {
    return await client.query(finalText, params);
  });
}

// Helper functions para consultas comuns da intranet
export const intranetQueries = {
  // Informativos
  getInformativos: () =>
    query('SELECT * FROM intranet.informativos ORDER BY criado_em DESC'),

  getInformativosAtivos: () =>
    query('SELECT * FROM intranet.informativos WHERE dta_validade >= CURRENT_DATE OR dta_validade IS NULL ORDER BY criado_em DESC'),

  // Plantão
  getPlantao: () =>
    query('SELECT * FROM intranet.plantao ORDER BY dtainicio DESC'),

  getPlantaoAberto: () =>
    query("SELECT * FROM intranet.plantao WHERE ind_finalizado = 'N' ORDER BY dtainicio DESC"),

  // FAQ
  getFaq: () =>
    query('SELECT id, nom_sistema, des_assunto, des_erro, des_resolucao, usuario_cadastro, criado_em, (imagem IS NOT NULL OR caminho_arquivo IS NOT NULL) AS tem_imagem FROM intranet.faq ORDER BY criado_em DESC'),

  getFaqBySistema: (sistema: string) =>
    query('SELECT id, nom_sistema, des_assunto, des_erro, des_resolucao, usuario_cadastro, criado_em, (imagem IS NOT NULL OR caminho_arquivo IS NOT NULL) AS tem_imagem FROM intranet.faq WHERE nom_sistema = $1 ORDER BY criado_em DESC', [sistema]),

  getSistemas: () =>
    query('SELECT * FROM intranet.sistemas ORDER BY nom_sistema'),

  // Contratos — lidos de intranet.contrato (drfticket)
  getContratos: () =>
    queryIntranet(`
      SELECT
        cod_grupo,
        des_grupo,
        cod_pessoa,
        nom_pessoa,
        num_cnpj_cpf,
        cod_item,
        des_item,
        num_telefone_1
      FROM intranet.contrato
      ORDER BY des_grupo, nom_pessoa
    `),

  // DTEF — lidos de intranet.dtef (drfticket)
  getDtef: () =>
    queryIntranet('SELECT * FROM intranet.dtef ORDER BY loja'),

  // AnyDesk
  getAnydeskAcessos: () =>
    queryIntranet('SELECT * FROM intranet.anydesk_acessos ORDER BY rede, unidade'),

  // Dados Restritos
  getDadosRestritos: () =>
    queryIntranet('SELECT id, des_projeto, des_funcao, des_complemento, des_link, criado_em FROM intranet.dados_restrito ORDER BY id'),

  // Config
  getConfig: (chave?: string) => {
    if (chave) {
      return query('SELECT * FROM intranet.config WHERE chave = $1', [chave]);
    }
    return query('SELECT * FROM intranet.config ORDER BY chave');
  },

  // Stats para dashboard
  getDashboardStats: async () => {
    const stats = await query(`
      SELECT
        (SELECT count(*) FROM intranet.informativos WHERE dta_validade >= CURRENT_DATE OR dta_validade IS NULL) as informativos_ativos,
        (SELECT count(*) FROM intranet.plantao WHERE ind_finalizado = 'N') as plantoes_abertos,
        (SELECT count(*) FROM intranet.faq) as total_faq,
        (SELECT count(*) FROM intranet.contratos) as total_contratos,
        (SELECT count(*) FROM intranet.dtef) as total_dtef,
        (SELECT count(*) FROM intranet.anydesk_acessos) as total_anydesk,
        (SELECT count(*) FROM intranet.dados_restritos) as total_dados_restritos
    `);
    return stats.rows[0];
  }
};

// Função para testar conectividade com ambos os schemas
export async function testConnection() {
  try {
    console.log('🔗 Testando conectividade com banco unificado...');

    // Testar schema public (DigitalRF-Help)
    await withConnection(db, async (client) => {
      return await client.query('SELECT 1 FROM usuarios LIMIT 1');
    });
    console.log('✅ Schema public (DigitalRF-Help) acessível');

    // Testar schema intranet
    await withConnection(db, async (client) => {
      return await client.query('SELECT 1 FROM intranet.informativos LIMIT 1');
    });
    console.log('✅ Schema intranet acessível');

    // Testar algumas consultas específicas
    const stats = await intranetQueries.getDashboardStats();
    console.log(`📊 Stats intranet: ${stats.informativos_ativos} informativos, ${stats.plantoes_abertos} plantões abertos, ${stats.total_faq} FAQs`);

    return {
      success: true,
      schemas: ['public', 'intranet'],
      stats
    };
  } catch (error) {
    console.error('❌ Erro ao testar conectividade:', error);
    return { success: false, error };
  }
}

// Fechar conexão
export async function closeConnection() {
  try {
    await Promise.all([
      db.end(),
      dbDrfweb.end()
    ]);
    console.log('🔌 Conexões de banco fechadas');
  } catch (error) {
    console.error('❌ Erro ao fechar conexão:', error);
  }
}

// Export the main database pool for direct access when needed
export { db };