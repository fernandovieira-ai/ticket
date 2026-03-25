import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notificarWhatsappNovoTicket } from "@/lib/whatsapp";
import { emailAberturaTicket } from "@/lib/email/send";

const criarTicketSchema = z.object({
  titulo: z.string().min(3).max(300),
  descricao: z.string().min(10),
  prioridade_id: z.string().uuid().optional().nullable(),
  categoria_id: z.string().uuid().optional().nullable(),
  subcategoria_id: z.string().uuid().optional().nullable(),
  cliente_id: z.string().uuid().optional().nullable(),
  atribuido_a: z.string().uuid().optional().nullable(),
  departamento_id: z.string().uuid().optional().nullable(),
  notificar_email: z.boolean().optional(),
  notificar_whatsapp: z.boolean().optional(),
});

// GET /api/tickets
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const busca = searchParams.get("q") ?? "";
  const statusId = searchParams.get("status_id") ?? "";
  const statusCodigo = searchParams.get("status_codigo") ?? "";
  const prioridadeId = searchParams.get("prioridade_id") ?? "";
  const meus = searchParams.get("meus") === "1";
  const fila = searchParams.get("fila") === "1";
  // "meus" sobrescreve atribuido_a com o próprio usuário da sessão
  const atribuidoA = meus
    ? session.sub
    : (searchParams.get("atribuido_a") ?? "");
  const pagina = Math.max(1, Number(searchParams.get("page") ?? 1));
  // Clientes podem receber mais registros (toda sua lista de chamados)
  const maxSize = session.perfil === "cliente" ? 500 : 50;
  const tamanho = Math.min(
    maxSize,
    Math.max(5, Number(searchParams.get("pageSize") ?? 20)),
  );
  const offset = (pagina - 1) * tamanho;

  // Se for cliente, lista apenas os tickets abertos pelo próprio usuário
  const abrirPor: string | null =
    session.perfil === "cliente" ? session.sub : null;

  // Query única com window function — evita round-trip extra para COUNT e
  // elimina o JOIN desnecessário em `usuarios` apenas para filtrar empresa_id
  // (tickets já possui coluna empresa_id indexada via idx_tickets_empresa).
  const rows = await query<{
    id: string;
    numero: string;
    titulo: string;
    canal: string;
    status_nome: string;
    status_cor: string;
    status_codigo: string;
    prioridade_nome: string;
    prioridade_cor: string;
    cliente_nome: string | null;
    atribuido_nome: string | null;
    departamento_nome: string | null;
    categoria_nome: string | null;
    criado_em: Date;
    atualizado_em: Date;
    sla_primeira_resp_deadline: Date | null;
    sla_resolucao_deadline: Date | null;
    respondido_em: Date | null;
    sla_primeira_resp_ok: boolean | null;
    fechado_em: Date | null;
    tempo_trabalho_minutos: number | null;
    sla_alerta_pct: number;
    total_count: number;
  }>(
    `SELECT
       t.id, t.numero, t.titulo, t.canal, t.criado_em, t.atualizado_em,
       t.sla_primeira_resp_deadline, t.sla_resolucao_deadline,
       t.respondido_em, t.sla_primeira_resp_ok, t.fechado_em, t.tempo_trabalho_minutos,
       ts.nome AS status_nome, ts.cor AS status_cor, ts.codigo AS status_codigo,
       tp.nome AS prioridade_nome, tp.cor AS prioridade_cor, tp.sla_alerta_pct,
       c.nome_razao AS cliente_nome,
       u.nome AS atribuido_nome,
       d.nome AS departamento_nome,
       cat.nome AS categoria_nome,
       COUNT(*) OVER() AS total_count
     FROM tickets t
     JOIN ticket_status ts ON ts.id = t.status_id
     JOIN ticket_prioridades tp ON tp.id = t.prioridade_id
     LEFT JOIN clientes c ON c.id = t.cliente_id
     LEFT JOIN usuarios u ON u.id = t.atribuido_a
     LEFT JOIN departamentos d ON d.id = t.departamento_id
     LEFT JOIN categorias cat ON cat.id = t.categoria_id
     WHERE t.empresa_id = $1
       AND ($2 = '' OR t.titulo ILIKE $2 OR t.numero ILIKE $2)
       AND ($3::uuid IS NULL OR t.status_id = $3::uuid)
       AND ($4 = '' OR ts.codigo = $4)
       AND ($5::uuid IS NULL OR t.prioridade_id = $5::uuid)
       AND ($6::uuid IS NULL OR t.atribuido_a = $6::uuid)
       AND (
         -- Usuário não é cliente: sem restrição por cliente/autor
         $10::uuid IS NULL
         -- Usuário cliente: apenas tickets abertos por este usuário
         OR t.aberto_por = $10::uuid
       )
       AND (NOT $9::boolean OR t.atribuido_a IS NULL)
       AND (NOT $9::boolean OR ts.codigo NOT IN ('finalizado', 'cancelado'))
     ORDER BY t.criado_em DESC
     LIMIT $7 OFFSET $8`,
    [
      session.empresaId,
      busca ? `%${busca}%` : "",
      statusId || null,
      statusCodigo || "",
      prioridadeId || null,
      atribuidoA || null,
      tamanho,
      offset,
      fila,
      abrirPor,
    ],
  );

  return NextResponse.json({
    data: rows,
    total: rows[0]?.total_count ?? 0,
    page: pagina,
    pageSize: tamanho,
  });
}

// POST /api/tickets
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = criarTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    titulo,
    descricao,
    prioridade_id,
    categoria_id,
    subcategoria_id,
    cliente_id,
    atribuido_a,
    departamento_id,
    notificar_email,
    notificar_whatsapp,
  } = parsed.data;
  const deveNotificarEmail = notificar_email !== false;
  const deveNotificarWhatsapp = notificar_whatsapp !== false;

  // Determinar cliente_id quando for perfil cliente
  let resolvedClienteId = cliente_id ?? null;
  if (session.perfil === "cliente") {
    if (cliente_id) {
      // Validar que o cliente_id pertence ao usuário logado
      const cli = await queryOne<{ id: string }>(
        `SELECT c.id FROM clientes c
         INNER JOIN usuario_clientes uc ON uc.cliente_id = c.id
         WHERE uc.usuario_id = $1 AND c.empresa_id = $2 AND c.id = $3
         LIMIT 1`,
        [session.sub, session.empresaId, cliente_id],
      );
      if (!cli)
        return NextResponse.json(
          { error: "Empresa não vinculada a este usuário." },
          { status: 403 },
        );
      resolvedClienteId = cli.id;
    } else {
      // Sem empresa selecionada: pegar o primeiro vínculo
      const cli = await queryOne<{ id: string }>(
        `SELECT c.id FROM clientes c
         INNER JOIN usuario_clientes uc ON uc.cliente_id = c.id
         WHERE uc.usuario_id = $1 AND c.empresa_id = $2
         LIMIT 1`,
        [session.sub, session.empresaId],
      );
      if (!cli)
        return NextResponse.json(
          {
            error:
              "Cliente não encontrado. Vincule este usuário a um cliente antes de abrir tickets.",
          },
          { status: 403 },
        );
      resolvedClienteId = cli.id;
    }
  }

  // Status padrão e prioridade padrão em paralelo
  const [statusPadrao, prioPadrao] = await Promise.all([
    queryOne<{ id: string }>(
      `SELECT id FROM ticket_status
       WHERE (empresa_id = $1 OR empresa_id IS NULL) AND codigo = 'aberto' AND ativo = true
       ORDER BY empresa_id NULLS LAST LIMIT 1`,
      [session.empresaId],
    ),
    !prioridade_id
      ? queryOne<{ id: string }>(
          `SELECT id FROM ticket_prioridades
           WHERE (empresa_id = $1 OR empresa_id IS NULL) AND codigo = 'normal' AND ativo = true
           ORDER BY empresa_id NULLS LAST LIMIT 1`,
          [session.empresaId],
        )
      : Promise.resolve(null),
  ]);

  if (!statusPadrao)
    return NextResponse.json(
      { error: "Status padrão não configurado" },
      { status: 500 },
    );

  let resolvedPrioridadeId = prioridade_id ?? null;
  if (!resolvedPrioridadeId) {
    resolvedPrioridadeId = prioPadrao?.id ?? null;
    if (!resolvedPrioridadeId)
      return NextResponse.json(
        { error: "Prioridade padrão não configurada" },
        { status: 500 },
      );
  }

  // Gerar número do ticket usando a função do banco (por empresa, sem full scan)
  const seqRow = await queryOne<{ numero: string }>(
    `SELECT fn_gerar_numero_ticket($1) AS numero`,
    [session.empresaId],
  );
  const numero = seqRow?.numero ?? String(Date.now());

  const canal = session.perfil === "cliente" ? "portal" : "painel";

  const [ticket] = await query<{
    id: string;
    numero: string;
    sla_primeira_resp_deadline: Date | null;
    sla_resolucao_deadline: Date | null;
  }>(
    `INSERT INTO tickets
       (empresa_id, numero, titulo, descricao, status_id, prioridade_id,
        categoria_id, subcategoria_id, cliente_id, aberto_por, atribuido_a,
        departamento_id, canal, sla_primeira_resp_deadline, sla_resolucao_deadline)
     VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
       now() + (SELECT sla_primeira_resposta FROM ticket_prioridades WHERE id = $6),
       now() + (SELECT sla_resolucao FROM ticket_prioridades WHERE id = $6)
     )
     RETURNING id, numero, sla_primeira_resp_deadline, sla_resolucao_deadline`,
    [
      session.empresaId,
      numero,
      titulo,
      descricao,
      statusPadrao.id,
      resolvedPrioridadeId,
      categoria_id ?? null,
      subcategoria_id ?? null,
      resolvedClienteId,
      session.sub,
      atribuido_a ?? null,
      departamento_id ?? null,
      canal,
    ],
  );

  // Registrar SLA inicial (deadlines no momento da criação)
  await query(
    `INSERT INTO sla_logs (ticket_id, evento, tipo, deadline, violado)
     VALUES ($1, 'criacao', 'primeira_resposta', $2, false),
            ($1, 'criacao', 'resolucao', $3, false)`,
    [ticket.id, ticket.sla_primeira_resp_deadline, ticket.sla_resolucao_deadline],
  );

  // Registrar mensagem inicial
  await query(
    `INSERT INTO mensagens (ticket_id, autor_id, corpo, interna) VALUES ($1, $2, $3, false)`,
    [ticket.id, session.sub, descricao],
  );

  // Notificar via WhatsApp os contatos do departamento (fire-and-forget)
  const deptNome = departamento_id
    ? ((
        await queryOne<{ nome: string }>(
          `SELECT nome FROM departamentos WHERE id = $1`,
          [departamento_id],
        )
      )?.nome ?? null)
    : null;
  const [abertoPorRow, prioridadeRow] = await Promise.all([
    queryOne<{ nome: string }>(`SELECT nome FROM usuarios WHERE id = $1`, [
      session.sub,
    ]),
    queryOne<{ nome: string }>(
      `SELECT nome FROM ticket_prioridades WHERE id = $1`,
      [resolvedPrioridadeId],
    ),
  ]);
  const abertoPorNome = abertoPorRow?.nome ?? "Usuário";
  const prioridadeNome = prioridadeRow?.nome ?? "Normal";

  if (deveNotificarWhatsapp) {
    notificarWhatsappNovoTicket({
      empresaId: session.empresaId,
      ticketId: ticket.id,
      ticketNumero: ticket.numero,
      ticketTitulo: titulo,
      prioridadeNome,
      departamentoId: departamento_id ?? null,
      departamentoNome: deptNome,
      abertoPorNome,
    });
  }

  // Notificar cliente por email (background — não bloqueia a resposta)
  if (deveNotificarEmail && resolvedClienteId) {
    const clienteEmailPromise = queryOne<{ email: string; nome_razao: string }>(
      `SELECT u.email, c.nome_razao FROM clientes c JOIN usuario_clientes uc ON uc.cliente_id = c.id JOIN usuarios u ON u.id = uc.usuario_id WHERE c.id = $1 LIMIT 1`,
      [resolvedClienteId],
    ).then(async (cli) => {
      if (cli?.email) {
        await emailAberturaTicket({
          emailCliente: cli.email,
          nomeCliente: cli.nome_razao,
          ticketId: ticket.id,
          numeroTicket: ticket.numero,
          titulo,
          descricao,
          prioridade: prioridadeNome,
        });
      }
    }).catch((err) => console.error("[email] abertura ticket:", err));

    // Registrar no contexto de execução mas sem bloquear a resposta ao cliente
    void clienteEmailPromise;
  }

  return NextResponse.json(ticket, { status: 201 });
}
