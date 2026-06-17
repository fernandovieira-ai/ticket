import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { TicketsClient } from "./tickets-client";
import { serverCache } from "@/lib/server-cache";

interface TicketRow {
  id: string;
  numero: string;
  titulo: string;
  canal: string;
  status_nome: string;
  status_cor: string;
  prioridade_nome: string;
  prioridade_cor: string;
  cliente_nome: string | null;
  atribuido_nome: string | null;
  departamento_nome: string | null;
  categoria_nome: string | null;
  criado_em: string;
  atualizado_em: string;
  sla_primeira_resp_deadline: string | null;
  sla_resolucao_deadline: string | null;
  respondido_em: string | null;
  sla_primeira_resp_ok: boolean | null;
  fechado_em: string | null;
  tempo_trabalho_minutos: number | null;
  sla_alerta_pct: number;
}

// Server component que carrega dados iniciais
export const maxDuration = 15;
export async function TicketsServer() {
  const session = await getSession();

  if (!session) {
    return <div>Acesso negado</div>;
  }

  // Carregamento paralelo de dados essenciais
  const [ticketsIniciais, opcoesPadrao] = await Promise.all([
    // Tickets iniciais (primeira página)
    carregarTicketsIniciais(session),
    // Opções de status e prioridades que sempre serão usadas
    carregarOpcoesPadrao(session),
  ]) as [
    { data: TicketRow[]; total: number },
    { status: any[]; prioridades: any[]; usuarios: any[] }
  ];

  return (
    <TicketsClient
      ticketsIniciais={ticketsIniciais}
      opcoesPadrao={opcoesPadrao}
      session={session}
    />
  );
}

// 🚀 Cache Settings Otimizados
const CACHE_TTL = {
  tickets: 300000,      // 5min - dados mudam frequentemente
  opcoes: 1800000,      // 30min - status/prioridades mudam pouco
  usuarios: 900000,     // 15min - meio termo
  count: 180000         // 3min - total de tickets
};

async function carregarTicketsIniciais(session: any) {
  const isCliente = session.perfil === "cliente";
  const cacheKey = `tickets_inicial_${isCliente ? session.sub : session.empresaId}_${session.perfil}`;

  // Cache otimizado com TTL maior
  const cached = serverCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const param = isCliente ? session.sub : session.empresaId;
    const whereClause = isCliente ? "t.aberto_por = $1" : "t.empresa_id = $1";

    // 🚀 Query Única Otimizada - Remove window function custosa
    const [tickets, totalCount] = await Promise.all([
      // Dados dos tickets
      query<TicketRow>(`
        SELECT
          t.id, t.numero, t.titulo, t.canal, t.criado_em, t.atualizado_em,
          t.sla_primeira_resp_deadline, t.sla_resolucao_deadline,
          t.respondido_em, t.sla_primeira_resp_ok, t.fechado_em, t.tempo_trabalho_minutos,
          ts.nome AS status_nome, ts.cor AS status_cor,
          tp.nome AS prioridade_nome, tp.cor AS prioridade_cor, tp.sla_alerta_pct,
          c.nome_razao AS cliente_nome,
          u.nome AS atribuido_nome,
          d.nome AS departamento_nome,
          cat.nome AS categoria_nome
        FROM tickets t
        JOIN ticket_status ts ON ts.id = t.status_id AND ts.ativo = true
        JOIN ticket_prioridades tp ON tp.id = t.prioridade_id AND tp.ativo = true
        LEFT JOIN clientes c ON c.id = t.cliente_id
        LEFT JOIN usuarios u ON u.id = t.atribuido_a AND u.ativo = true
        LEFT JOIN departamentos d ON d.id = t.departamento_id AND d.ativo = true
        LEFT JOIN categorias cat ON cat.id = t.categoria_id AND cat.ativo = true
        WHERE ${whereClause}
        ORDER BY t.atualizado_em DESC
        LIMIT 20
      `, [param]),

      // Total count em query separada e cacheada
      getTicketCount(session, whereClause, param)
    ]);

    const result = {
      data: tickets,
      total: totalCount,
    };

    // Cache otimizado por 5 minutos
    serverCache.set(cacheKey, result, CACHE_TTL.tickets);
    return result;
  } catch (error) {
    console.error('[TicketsServer] Erro ao carregar tickets:', error);
    return { data: [], total: 0 };
  }
}

// 🚀 Count Query Separada e Cacheada
async function getTicketCount(session: any, whereClause: string, param: any): Promise<number> {
  const countCacheKey = `tickets_count_${session.empresaId}_${session.perfil}`;
  const cachedCount = serverCache.get(countCacheKey);

  if (cachedCount !== null && cachedCount !== undefined) {
    return cachedCount as number;
  }

  try {
    const [{ count }] = await query<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM tickets t
      WHERE ${whereClause}
    `, [param]);

    // Cache do total por mais tempo (3min) pois muda menos
    serverCache.set(countCacheKey, count, CACHE_TTL.count);
    return count;
  } catch (error) {
    console.error('[TicketsServer] Erro ao contar tickets:', error);
    return 0;
  }
}

async function carregarOpcoesPadrao(session: any) {
  const cacheKey = `opcoes_padrao_${session.empresaId}`;

  // Tentar cache primeiro (5 minutos TTL - essas opções mudam menos)
  const cached = serverCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const [status, prioridades, usuarios] = await Promise.all([
      // Status
      query(`
        SELECT id, nome, codigo, cor
        FROM ticket_status
        WHERE empresa_id = $1
        ORDER BY nome
      `, [session.empresaId]),

      // Prioridades
      query(`
        SELECT id, nome, cor
        FROM ticket_prioridades
        WHERE empresa_id = $1
        ORDER BY ordem DESC
      `, [session.empresaId]),

      // Usuários (se não for cliente)
      session.perfil !== "cliente" ? query(`
        SELECT id, nome
        FROM usuarios
        WHERE empresa_id = $1 AND perfil != 'cliente' AND ativo = true
        ORDER BY nome
      `, [session.empresaId]) : [],
    ]);

    const result = { status, prioridades, usuarios };

    // Cache por 30 minutos — status e prioridades mudam muito raramente
    serverCache.set(cacheKey, result, CACHE_TTL.opcoes);
    return result;
  } catch (error) {
    console.error('[TicketsServer] Erro ao carregar opções:', error);
    return { status: [], prioridades: [], usuarios: [] };
  }
}