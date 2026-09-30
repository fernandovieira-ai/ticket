export type PropostaStatus = 'aguardando' | 'aprovada' | 'rejeitada' | 'aplicada' | 'falhou' | 'obsoleta';
export type TipoCorrecao = 'configuracao' | 'dados' | 'codigo' | 'infraestrutura' | 'outro';
export type NivelRisco = 'baixo' | 'medio' | 'alto' | 'critico';

const TIPOS_CORRECAO: readonly TipoCorrecao[] = ['configuracao', 'dados', 'codigo', 'infraestrutura', 'outro'];
// Nomes antigos que ainda podem estar salvos em agente_config.auto_aprovar_tipos (a migration que
// renomeou os tipos só atualizou agente_propostas)
const TIPO_CORRECAO_LEGADO: Record<string, TipoCorrecao> = { query_sql: 'dados', logica: 'codigo', permissao: 'configuracao' };

/** Converte nomes antigos de tipo para os atuais, descarta valores desconhecidos e remove duplicados. */
export function normalizarTiposCorrecao(tipos: readonly string[] | null | undefined): TipoCorrecao[] {
  const saida = new Set<TipoCorrecao>();
  for (const t of tipos ?? []) {
    const atual = TIPO_CORRECAO_LEGADO[t] ?? t;
    if ((TIPOS_CORRECAO as readonly string[]).includes(atual)) saida.add(atual as TipoCorrecao);
  }
  return [...saida];
}

export interface InstrucaoRefinamento {
  instrucao: string;
  titulo: string;
}

export interface AgenteProposta {
  id: string;
  empresa_id: string;
  titulo: string;
  descricao_erro: string;
  analise: string;
  correcao_proposta: string;
  sql_correcao: string | null;
  /** Nome da base (principal ou uma das bases adicionais do cliente) onde sql_correcao deve rodar */
  base_alvo: string;
  tipo: TipoCorrecao;
  nivel_risco: NivelRisco;
  status: PropostaStatus;
  aprovado_por: string | null;
  aprovado_por_nome: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  erro_hash: string | null;
  /** "codigo" da linha em exchange_emsys_gestao_monitoramento_pend, quando veio do painel builtin */
  painel_codigo: string | null;
  /** Queries + resultados reais já coletados nas investigações desta proposta */
  dados_investigacao: string | null;
  /** Instruções que o operador já enviou em refinamentos anteriores (mais antiga primeiro) */
  instrucoes_anteriores: InstrucaoRefinamento[];
  aplicado_em: string | null;
  aplicacao_erro: string | null;
  /** true quando o próprio agente aplicou o SQL (autonomia), sem clique de operador */
  aplicado_por_agente: boolean;
  /** Quando a varredura confirmou que o erro realmente sumiu depois de aplicada */
  confirmado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface AgenteConfig {
  id: string;
  empresa_id: string;
  ativo: boolean;
  auto_aprovar_tipos: TipoCorrecao[];
  /** Liga a aplicação automática de SQL, por família de erro com histórico de sucessos confirmados */
  autonomia_ativa: boolean;
  /** Sucessos confirmados seguidos que uma família de erro precisa ter antes de ser aplicada sozinha */
  autonomia_min_sucessos: number;
  /** Máximo de aplicações automáticas por empresa nas últimas 24h */
  autonomia_limite_diario: number;
  notificar_email: boolean;
  notificar_whatsapp: boolean;
  webhook_token: string;
  criado_em: string;
  atualizado_em: string;
}

export interface AgenteCliente {
  id: string;
  empresa_id: string;
  nome: string;
  slug: string;
  db_host: string;
  db_porta: number;
  db_nome: string;
  db_usuario: string;
  db_senha: string;
  db_schema: string;
  query_erros: string | null;
  analise_painel: boolean;
  ultimo_scan: string | null;
  notas: string | null;
  ativo: boolean;
  /** Quando o vínculo AS x EMSys3 (CNPJ) foi validado com sucesso pela última vez */
  vinculo_validado_em: string | null;
  /** CNPJs raiz confirmados nas duas bases */
  vinculo_cnpjs: string | null;
  /** Motivo da última validação que falhou (null quando ok) */
  vinculo_erro: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface AgenteClientePublico extends Omit<AgenteCliente, 'db_senha'> {
  db_senha: string; // mascara: '••••••••'
}

/** 'emsys' = base EMSys3 obrigatória do cliente (vinculada ao AS por CNPJ); 'outro' = adicional livre */
export type PapelBase = 'emsys' | 'outro';

/** Base de dados adicional para investigacao (ex: emsys3 alem do AS) */
export interface AgenteClienteBase {
  id: string;
  cliente_id: string;
  empresa_id: string;
  nome: string;
  papel: PapelBase;
  descricao: string | null;
  db_host: string;
  db_porta: number;
  db_nome: string;
  db_usuario: string;
  db_senha: string;
  db_schema: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface AgenteClienteBasePublico extends Omit<AgenteClienteBase, 'db_senha'> {
  db_senha: string;
}

/**
 * Lição generalizada extraída de uma proposta aprovada — sem os valores específicos
 * de uma ocorrência (ex: sem o código IBGE exato, só o padrão/regra de negócio).
 * Deduplicada por tópico: no máximo 1 linha por (empresa, tópico), reforçada a cada
 * nova aprovação relacionada em vez de crescer 1 linha por erro.
 */
export interface AgenteConhecimento {
  id: string;
  empresa_id: string;
  cliente_id: string | null;
  topico: string;
  resumo: string;
  vezes_reforcada: number;
  ativa: boolean;
  criado_em: string;
  atualizado_em: string;
}

/** Regra aprendida automaticamente pelo agente (knowledge base) */
export interface AgenteRegra {
  id: string;
  empresa_id: string;
  cliente_id: string | null;
  pattern: string;
  pattern_hash: string;
  resumo: string;
  solucao: string;
  /** SQL já aprovado por um humano — permite reaplicar instantaneamente sem chamar IA de novo */
  sql_correcao: string | null;
  base_alvo: string | null;
  tipo: TipoCorrecao | null;
  nivel_risco: NivelRisco | null;
  bases_consultadas: string[];
  confianca: number;
  vezes_aplicada: number;
  ativa: boolean;
  /** Hash da descrição do erro sem valores específicos — liga regras de uma mesma família de erros */
  assinatura_hash: string | null;
  criado_em: string;
  atualizado_em: string;
}

/** Confiança acumulada por família de erro (assinatura) — decide se o agente pode aplicar sozinho */
export interface AgenteAutonomia {
  empresa_id: string;
  assinatura_hash: string;
  assinatura: string;
  sucessos_confirmados: number;
  falhas_consecutivas: number;
  total_sucessos: number;
  total_falhas: number;
  ultima_confirmacao_em: string | null;
  ultima_falha_em: string | null;
  /** Operador marcou este tipo de erro para o agente executar sozinho (independe da autonomia geral) */
  auto_aplicar?: boolean;
  auto_aplicar_em?: string | null;
}

export interface AnalisarErroInput {
  empresa_id: string;
  descricao_erro: string;
  contexto?: string;
  stack_trace?: string;
  cliente_id?: string;
  erro_hash?: string;
  bases_contexto?: BaseContexto[];
  schema_tabelas?: string; // definições de colunas das tabelas relevantes do cliente
  dados_reais?: string; // resultado de queries de investigação executadas contra o banco real
  codigo_painel?: string; // "codigo" da linha no painel AS, quando a origem foi o painel builtin
  /** Caso semelhante já resolvido e aprovado antes (outra ocorrência da mesma família de erro) */
  caso_analogo?: string;
}

/** Contexto coletado de uma base adicional para enriquecer a analise */
export interface BaseContexto {
  nome: string;
  descricao: string | null;
  tabelas_relevantes: string;
}

export interface AnalisarErroOutput {
  titulo: string;
  analise: string;
  correcao_proposta: string;
  sql_correcao: string | null;
  /** Nome da base onde sql_correcao deve rodar (ex: "principal" ou o nome de uma base adicional) */
  base_alvo?: string;
  tipo: TipoCorrecao;
  nivel_risco: NivelRisco;
  confianca: number;
}

export interface ProcessarErroResult {
  proposta: AgenteProposta;
  auto_aprovada: boolean;
}
