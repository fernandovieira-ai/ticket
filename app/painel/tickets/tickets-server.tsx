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

async function carregarTicketsIniciais(session: any) {
  const cacheKey = `tickets_inicial_${session.sub}_${session.perfil}`;

  // Tentar cache primeiro (30 segundos TTL)
  const cached = serverCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const whereClause = session.perfil === "cliente"
      ? "WHERE t.aberto_por = $1"
      : "WHERE t.empresa_id = $1";

    const tickets = await query<TicketRow>(`
      SELECT
        t.id, t.numero, t.titulo, t.canal, t.criado_em, t.atualizado_em,
        t.sla_primeira_resp_deadline, t.sla_resolucao_deadline,
        t.respondido_em, t.sla_primeira_resp_ok, t.fechado_em,
        t.tempo_trabalho_minutos, t.sla_alerta_pct,
        ts.nome AS status_nome, ts.cor AS status_cor,
        tp.nome AS prioridade_nome, tp.cor AS prioridade_cor,
        c.nome_razao AS cliente_nome,
        u.nome AS atribuido_nome,
        d.nome AS departamento_nome,
        tc.nome AS categoria_nome
      FROM tickets t
      JOIN ticket_status ts ON ts.id = t.status_id
      JOIN ticket_prioridades tp ON tp.id = t.prioridade_id
      LEFT JOIN clientes c ON c.id = t.cliente_id
      LEFT JOIN usuarios u ON u.id = t.atribuido_a
      LEFT JOIN departamentos d ON d.id = t.departamento_id
      LEFT JOIN ticket_categorias tc ON tc.id = t.categoria_id
      ${whereClause}
      ORDER BY t.atualizado_em DESC
      LIMIT 20
    `, [session.perfil === "cliente" ? session.sub : session.empresaId]);

    const result = {
      data: tickets,
      total: tickets.length,
    };

    // Cache por 30 segundos
    serverCache.set(cacheKey, result, 30000);
    return result;
  } catch (error) {
    console.error('[TicketsServer] Erro ao carregar tickets:', error);
    return { data: [], total: 0 };
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

    // Cache por 5 minutos - essas opções mudam menos frequentemente
    serverCache.set(cacheKey, result, 5 * 60 * 1000);
    return result;
  } catch (error) {
    console.error('[TicketsServer] Erro ao carregar opções:', error);
    return { status: [], prioridades: [], usuarios: [] };
  }
}