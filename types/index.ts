// ============================================================
// Tipos TypeScript — espelham o schema SQL v1.1
// ============================================================

export type PerfilUsuario =
  | "admin"
  | "supervisor"
  | "operador"
  | "cliente"
  | "somente_leitura";
export type StatusNotificacao = "pendente" | "enviada" | "falha";
export type CanalNotificacao = "email" | "painel" | "ambos";
export type TipoCampoExtra =
  | "texto"
  | "numero"
  | "data"
  | "select"
  | "booleano";
export type StatusSolicitacao =
  | "aberta"
  | "em_andamento"
  | "aguardando"
  | "concluida"
  | "cancelada";
export type VisibilidadeArtigo = "publico" | "interno";

// ============================================================
// EMPRESA
// ============================================================
export interface Empresa {
  id: string;
  nome: string;
  dominio: string | null;
  logo_url: string | null;
  fuso_horario: string;
  idioma: string;
  prefixo_ticket: string;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
}

// ============================================================
// TICKET STATUS / PRIORIDADE
// ============================================================
export interface TicketStatus {
  id: string;
  empresa_id: string | null;
  codigo: string;
  nome: string;
  descricao: string | null;
  cor: string;
  icone: string | null;
  ordem: number;
  pausa_sla: boolean;
  encerra: boolean;
  permite_reabrir: boolean;
  sistema: boolean;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
}

export interface TicketPrioridade {
  id: string;
  empresa_id: string | null;
  codigo: string;
  nome: string;
  descricao: string | null;
  cor: string;
  icone: string | null;
  ordem: number;
  sla_primeira_resposta: string;
  sla_resolucao: string;
  sla_alerta_pct: number;
  sistema: boolean;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
}

// ============================================================
// DEPARTAMENTO
// ============================================================
export interface Departamento {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  criado_em: Date;
}

// ============================================================
// USUÁRIO
// ============================================================
export interface Usuario {
  id: string;
  empresa_id: string;
  departamento_id: string | null;
  nome: string;
  email: string;
  password_hash?: string;
  perfil: PerfilUsuario;
  avatar_url: string | null;
  telefone: string | null;
  whatsapp_jid: string | null;
  ativo: boolean;
  tentativas_login: number;
  bloqueado_ate: Date | null;
  ultimo_acesso: Date | null;
  criado_em: Date;
  atualizado_em: Date;
}

export interface UsuarioSemSenha extends Omit<Usuario, "password_hash"> {}

// ============================================================
// LOG DE ACESSO
// ============================================================
export interface LogAcesso {
  id: number;
  usuario_id: string;
  ip: string | null;
  user_agent: string | null;
  sucesso: boolean;
  criado_em: Date;
}

// ============================================================
// CLIENTE
// ============================================================
export interface Cliente {
  id: string;
  empresa_id: string;
  nome_razao: string;
  tipo: string; // 'J' = Jurídica | 'F' = Física
  documento: string | null;
  email: string | null;
  telefone: string | null;
  segmento: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  endereco: Record<string, unknown> | null;
  observacoes: string | null;
  ind_pre_cadastro: boolean;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
}

export interface ContatoCliente {
  id: string;
  cliente_id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  principal: boolean;
  criado_em: Date;
}

// ============================================================
// SUBCATEGORIA
// ============================================================
export interface Subcategoria {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  criado_em: Date;
  categorias_nomes?: string[] | null;
}

// ============================================================
// CATEGORIA
// ============================================================
export interface Categoria {
  id: string;
  parent_id: string | null;
  parent_nome?: string | null;
  departamentos_nomes?: string[] | null;
  nome: string;
  descricao: string | null;
  sla_primeira_resp: string | null;
  sla_resolucao: string | null;
  visivel_cliente: boolean;
  ativo: boolean;
  ordem: number;
  criado_em: Date;
}

// ============================================================
// TICKET
// ============================================================
export interface Ticket {
  id: string;
  empresa_id: string;
  numero: string;
  titulo: string;
  descricao: string;
  status_id: string;
  prioridade_id: string;
  categoria_id: string | null;
  subcategoria_id: string | null;
  cliente_id: string | null;
  aberto_por: string;
  atribuido_a: string | null;
  departamento_id: string | null;
  canal: string;
  sla_primeira_resp_deadline: Date | null;
  sla_resolucao_deadline: Date | null;
  sla_pausado_em: Date | null;
  sla_primeira_resp_ok: boolean | null;
  sla_resolucao_ok: boolean | null;
  respondido_em: Date | null;
  resolvido_em: Date | null;
  fechado_em: Date | null;
  reaberto_em: Date | null;
  criado_em: Date;
  atualizado_em: Date;
}

// Ticket com joins para exibição
export interface TicketCompleto extends Ticket {
  status: TicketStatus;
  prioridade: TicketPrioridade;
  cliente?: Cliente;
  aberto_por_usuario?: UsuarioSemSenha;
  atribuido_usuario?: UsuarioSemSenha;
  categoria?: Categoria;
}

// ============================================================
// MENSAGEM
// ============================================================
export interface Mensagem {
  id: string;
  ticket_id: string;
  autor_id: string;
  corpo: string;
  interna: boolean;
  lido_em: Date | null;
  criado_em: Date;
}

export interface MensagemCompleta extends Mensagem {
  autor: UsuarioSemSenha;
}

// ============================================================
// NOTIFICAÇÃO
// ============================================================
export interface Notificacao {
  id: number;
  empresa_id: string;
  usuario_id: string;
  tipo: string;
  titulo: string | null;
  payload: Record<string, unknown> | null;
  canal: CanalNotificacao;
  lida: boolean;
  status: StatusNotificacao;
  lida_em: Date | null;
  enviada_em: Date | null;
  criado_em: Date;
}

// ============================================================
// WHATSAPP CONTATOS
// ============================================================
export interface WhatsappContato {
  id: string;
  empresa_id: string;
  usuarios_id: string | null;
  numero: string;
  nome: string | null;
  avatar_url: string | null;
  ultimo_msg: Date | null;
  criado_em: Date;
  id_departamentos: string | null;
}

// ============================================================
// IA
// ============================================================
export interface IAConfig {
  id: string;
  empresa_id: string;
  modelo: string;
  max_tokens: number;
  prompt_sugestao: string | null;
  prompt_classificar: string | null;
  prompt_resumir: string | null;
  prompt_whatsapp_bot: string | null;
  limite_diario: number;
  ativo: boolean;
}

export interface IALog {
  id: number;
  empresa_id: string;
  ticket_id: string | null;
  usuario_id: string | null;
  tipo: string;
  prompt_resumido: string | null;
  resposta: string | null;
  tokens_entrada: number | null;
  tokens_saida: number | null;
  latencia_ms: number | null;
  confianca: number | null;
  usado: boolean;
  criado_em: Date;
}

// ============================================================
// PERMISSÕES DE TELAS
// ============================================================
export interface PermissaoTela {
  id: string;
  empresa_id: string;
  perfil: PerfilUsuario;
  tela_rota: string;
  tela_nome: string;
  pode_acessar: boolean;
  pode_editar: boolean;
  criado_em: Date;
  atualizado_em: Date;
}

// ============================================================
// JWT PAYLOAD
// ============================================================
export interface JWTPayload {
  sub: string; // usuario.id
  empresaId: string;
  perfil: PerfilUsuario;
  nome: string;
  email: string;
}

// ============================================================
// API RESPONSES
// ============================================================
export interface ApiError {
  error: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
