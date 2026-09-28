export type PropostaStatus = 'aguardando' | 'aprovada' | 'rejeitada' | 'aplicada' | 'falhou' | 'obsoleta';
export type TipoCorrecao = 'configuracao' | 'dados' | 'codigo' | 'infraestrutura' | 'outro';
export type NivelRisco = 'baixo' | 'medio' | 'alto' | 'critico';

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
  criado_em: string;
  atualizado_em: string;
}

export interface AgenteConfig {
  id: string;
  empresa_id: string;
  ativo: boolean;
  auto_aprovar_tipos: TipoCorrecao[];
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
  criado_em: string;
  atualizado_em: string;
}

export interface AgenteClientePublico extends Omit<AgenteCliente, 'db_senha'> {
  db_senha: string; // mascara: '••••••••'
}

/** Base de dados adicional para investigacao (ex: emsys3 alem do AS) */
export interface AgenteClienteBase {
  id: string;
  cliente_id: string;
  empresa_id: string;
  nome: string;
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
  criado_em: string;
  atualizado_em: string;
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
