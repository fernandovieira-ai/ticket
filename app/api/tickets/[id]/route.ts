import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notificarWhatsappTransferencia } from "@/lib/whatsapp";
import { emailMudancaStatus, emailTransferenciaTicket } from "@/lib/email/send";

const atualizarTicketSchema = z.object({
  titulo: z.string().min(3).max(300).optional(),
  descricao: z.string().min(1).optional(),
  status_id: z.string().uuid().optional(),
  prioridade_id: z.string().uuid().optional(),
  atribuido_a: z.string().uuid().nullable().optional(),
  departamento_id: z.string().uuid().nullable().optional(),
  categoria_id: z.string().uuid().nullable().optional(),
  subcategoria_id: z.string().uuid().nullable().optional(),
  tempo_trabalho_minutos: z.number().int().min(0).optional(),
  log_edicao: z.boolean().optional(),
});

// GET /api/tickets/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = req.nextUrl;
  const includeMessages = searchParams.get("includeMessages") === "true";
  const includeClient = searchParams.get("includeClient") === "true";

  const ticket = await queryOne<{
    id: string;
    numero: string;
    titulo: string;
    descricao: string;
    canal: string;
    status_id: string;
    status_nome: string;
    status_cor: string;
    status_encerra: boolean;
    prioridade_id: string;
    prioridade_nome: string;
    prioridade_cor: string;
    cliente_id: string | null;
    cliente_nome: string | null;
    atribuido_a: string | null;
    atribuido_nome: string | null;
    aberto_por: string;
    aberto_por_nome: string;
    departamento_id: string | null;
    departamento_nome: string | null;
    categoria_id: string | null;
    categoria_nome: string | null;
    subcategoria_id: string | null;
    subcategoria_nome: string | null;
    criado_em: Date;
    atualizado_em: Date;
    sla_primeira_resp_deadline: Date | null;
    sla_resolucao_deadline: Date | null;
    sla_alerta_pct: number;
  }>(
    `SELECT
       t.id, t.numero, t.titulo, t.descricao, t.canal,
       t.status_id, ts.nome AS status_nome, ts.cor AS status_cor, ts.encerra AS status_encerra,
       t.prioridade_id, tp.nome AS prioridade_nome, tp.cor AS prioridade_cor,
       t.cliente_id, c.nome_razao AS cliente_nome,
       t.atribuido_a, ua.nome AS atribuido_nome,
       t.aberto_por, uab.nome AS aberto_por_nome,
       t.departamento_id, d.nome AS departamento_nome,
       t.categoria_id, cat.nome AS categoria_nome,
       t.subcategoria_id, NULL AS subcategoria_nome,
       t.criado_em, t.atualizado_em,
       t.sla_primeira_resp_deadline, t.sla_resolucao_deadline, tp.sla_alerta_pct
     FROM tickets t
     JOIN ticket_status ts ON ts.id = t.status_id
     JOIN ticket_prioridades tp ON tp.id = t.prioridade_id
     LEFT JOIN clientes c ON c.id = t.cliente_id
     LEFT JOIN usuarios ua ON ua.id = t.atribuido_a
     JOIN usuarios uab ON uab.id = t.aberto_por
     LEFT JOIN departamentos d ON d.id = t.departamento_id
     LEFT JOIN categorias cat ON cat.id = t.categoria_id
     WHERE t.id = $1`,
    [id],
  );

  if (!ticket)
    return NextResponse.json(
      { error: "Ticket não encontrado" },
      { status: 404 },
    );

  // Cliente só pode ver ticket que ele mesmo abriu
  if (session.perfil === "cliente") {
    if (ticket.aberto_por !== session.sub) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
  }

  // Preparar resposta otimizada
  const response: any = { ...ticket };

  // Incluir mensagens se solicitado
  if (includeMessages) {
    const mensagens = await query<{
      id: string;
      corpo: string;
      interna: boolean;
      criado_em: Date;
      autor_id: string;
      autor_nome: string;
      autor_perfil: string;
      autor_avatar: string | null;
    }>(
      `SELECT m.id, m.corpo, m.interna, m.criado_em,
              u.id as autor_id, u.nome as autor_nome, u.perfil as autor_perfil, u.avatar_url as autor_avatar
       FROM mensagens m
       JOIN usuarios u ON u.id = m.autor_id
       WHERE m.ticket_id = $1
         AND m.empresa_id = $2
       ORDER BY m.criado_em ASC`,
      [id, session.empresaId]
    );

    // Buscar anexos para todas as mensagens em uma query (apenas se há mensagens)
    const anexos = mensagens.length > 0 ? await query<{
      id: string;
      mensagem_id: string;
      nome: string;
      url: string;
      tamanho: number | null;
      mime_type: string | null;
    }>(
      `SELECT id, mensagem_id, nome, url, tamanho, mime_type
       FROM anexos
       WHERE mensagem_id = ANY($1::uuid[])`,
      [mensagens.map(m => m.id)]
    ) : [];

    // Agrupar anexos por mensagem
    const anexosPorMensagem = anexos.reduce((acc, anexo) => {
      if (!acc[anexo.mensagem_id]) acc[anexo.mensagem_id] = [];
      acc[anexo.mensagem_id].push({
        id: anexo.id,
        nome: anexo.nome,
        url: anexo.url,
        tamanho: anexo.tamanho,
        mime_type: anexo.mime_type,
      });
      return acc;
    }, {} as Record<string, any[]>);

    // Adicionar anexos às mensagens
    response.mensagens = mensagens.map(m => ({
      ...m,
      anexos: anexosPorMensagem[m.id] || [],
    }));
  }

  // Incluir dados do cliente se solicitado
  if (includeClient && ticket.cliente_id) {
    const cliente = await queryOne<{
      email: string | null;
      telefone: string | null;
      documento: string | null;
      segmento: string | null;
    }>(
      `SELECT email, telefone, documento, segmento
       FROM clientes
       WHERE id = $1 AND empresa_id = $2`,
      [ticket.cliente_id, session.empresaId]
    );
    if (cliente) {
      response.cliente_detalhe = cliente;
    }
  }

  // Adicionar cache headers para melhor performance
  const res = NextResponse.json(response);
  res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
  return res;
}

// PATCH /api/tickets/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (session.perfil === "cliente" || session.perfil === "somente_leitura") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = atualizarTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const ticket = await queryOne<{ id: string }>(
    `SELECT id FROM tickets WHERE id = $1`,
    [id],
  );
  if (!ticket)
    return NextResponse.json(
      { error: "Ticket não encontrado" },
      { status: 404 },
    );

  // Busca estado atual para log de auditoria (quando log_edicao = true)
  let ticketAntes: {
    titulo: string;
    descricao: string;
    departamento_id: string | null;
    departamento_nome: string | null;
    categoria_id: string | null;
    categoria_nome: string | null;
    subcategoria_id: string | null;
    subcategoria_nome: string | null;
    prioridade_id: string;
    prioridade_nome: string;
    atribuido_a: string | null;
    atribuido_nome: string | null;
  } | null = null;

  if (parsed.data.log_edicao) {
    ticketAntes = await queryOne<{
      titulo: string;
      descricao: string;
      departamento_id: string | null;
      departamento_nome: string | null;
      categoria_id: string | null;
      categoria_nome: string | null;
      subcategoria_id: string | null;
      subcategoria_nome: string | null;
      prioridade_id: string;
      prioridade_nome: string;
      atribuido_a: string | null;
      atribuido_nome: string | null;
    }>(
      `SELECT t.titulo, t.descricao, t.departamento_id, d.nome AS departamento_nome,
              t.categoria_id, cat.nome AS categoria_nome,
              t.subcategoria_id, sub.nome AS subcategoria_nome,
              t.prioridade_id, tp.nome AS prioridade_nome,
              t.atribuido_a, ua.nome AS atribuido_nome
       FROM tickets t
       LEFT JOIN departamentos d ON d.id = t.departamento_id
       LEFT JOIN categorias cat ON cat.id = t.categoria_id
       LEFT JOIN subcategorias sub ON sub.id = t.subcategoria_id
       JOIN ticket_prioridades tp ON tp.id = t.prioridade_id
       LEFT JOIN usuarios ua ON ua.id = t.atribuido_a
       WHERE t.id = $1`,
      [id],
    );
  }

  const campos: string[] = [];
  const valores: unknown[] = [];
  let idx = 1;

  if (parsed.data.titulo !== undefined) {
    campos.push(`titulo = $${idx++}`);
    valores.push(parsed.data.titulo);
  }
  if (parsed.data.descricao !== undefined) {
    campos.push(`descricao = $${idx++}`);
    valores.push(parsed.data.descricao);
  }
  // Captura dados para email de status (antes do UPDATE)
  let emailStatusDados: {
    statusAnteriorNome: string;
    statusNovoNome: string;
    statusNovoEncerra: boolean;
  } | null = null;
  let novoStatus: { nome: string; codigo: string; encerra: boolean } | null =
    null;
  let ticketAtual: {
    status_encerra: boolean;
    status_nome: string;
    sla_resolucao_deadline: Date | null;
  } | null = null;

  if (parsed.data.status_id !== undefined) {
    campos.push(`status_id = $${idx++}`);
    valores.push(parsed.data.status_id);

    // Busca info do novo status e do status atual para preencher datas de ciclo de vida
    [novoStatus, ticketAtual] = await Promise.all([
      queryOne<{ nome: string; codigo: string; encerra: boolean }>(
        `SELECT nome, codigo, encerra FROM ticket_status WHERE id = $1`,
        [parsed.data.status_id],
      ),
      queryOne<{
        status_encerra: boolean;
        status_nome: string;
        sla_resolucao_deadline: Date | null;
      }>(
        `SELECT ts.encerra AS status_encerra, ts.nome AS status_nome,
                t.sla_resolucao_deadline
         FROM tickets t JOIN ticket_status ts ON ts.id = t.status_id WHERE t.id = $1`,
        [id],
      ),
    ]);

    if (novoStatus) {
      if (novoStatus.codigo === "resolvido") {
        campos.push(`resolvido_em = now()`);
      }
      if (novoStatus.encerra) {
        campos.push(`fechado_em = now()`);
      }
      // Reabertura: saindo de um status encerra para um que não encerra
      if (ticketAtual?.status_encerra && !novoStatus.encerra) {
        campos.push(`reaberto_em = now()`);
        campos.push(`fechado_em = NULL`);
      }
      emailStatusDados = {
        statusAnteriorNome: ticketAtual?.status_nome ?? "",
        statusNovoNome: novoStatus.nome,
        statusNovoEncerra: novoStatus.encerra,
      };
    }
  }
  if (parsed.data.prioridade_id !== undefined) {
    campos.push(`prioridade_id = $${idx++}`);
    valores.push(parsed.data.prioridade_id);
  }
  let novoAtribuidoAId: string | null | undefined = undefined;
  if ("atribuido_a" in parsed.data) {
    campos.push(`atribuido_a = $${idx++}`);
    valores.push(parsed.data.atribuido_a ?? null);
    novoAtribuidoAId = parsed.data.atribuido_a ?? null;
  }
  if ("departamento_id" in parsed.data) {
    campos.push(`departamento_id = $${idx++}`);
    valores.push(parsed.data.departamento_id ?? null);
  }
  if ("categoria_id" in parsed.data) {
    campos.push(`categoria_id = $${idx++}`);
    valores.push(parsed.data.categoria_id ?? null);
  }
  if ("subcategoria_id" in parsed.data) {
    campos.push(`subcategoria_id = $${idx++}`);
    valores.push(parsed.data.subcategoria_id ?? null);
  }
  if (parsed.data.tempo_trabalho_minutos !== undefined) {
    campos.push(`tempo_trabalho_minutos = $${idx++}`);
    valores.push(parsed.data.tempo_trabalho_minutos);
  }

  if (campos.length === 0)
    return NextResponse.json(
      { error: "Nenhum campo para atualizar" },
      { status: 400 },
    );

  campos.push(`atualizado_em = now()`);
  valores.push(id);

  const ticketInfo = novoAtribuidoAId
    ? await queryOne<{
        numero: string;
        titulo: string;
        empresa_id: string;
        prioridade_nome: string;
      }>(
        `SELECT t.numero, t.titulo, t.empresa_id, tp.nome AS prioridade_nome
         FROM tickets t JOIN ticket_prioridades tp ON tp.id = t.prioridade_id
         WHERE t.id = $1`,
        [id],
      )
    : null;

  await query(
    `UPDATE tickets SET ${campos.join(", ")} WHERE id = $${idx}`,
    valores,
  );

  // Atualiza primeira mensagem se descrição foi alterada
  if (parsed.data.descricao !== undefined) {
    await query(
      `UPDATE mensagens SET corpo = $1
       WHERE ticket_id = $2
         AND id = (SELECT id FROM mensagens WHERE ticket_id = $2 ORDER BY criado_em ASC LIMIT 1)`,
      [parsed.data.descricao, id],
    );
  }

  // Log de auditoria de edição (nota interna automática)
  if (parsed.data.log_edicao && ticketAntes) {
    const mudancas: string[] = [];
    if (
      parsed.data.titulo !== undefined &&
      parsed.data.titulo !== ticketAntes.titulo
    ) {
      mudancas.push(
        `<strong>Título:</strong> "${ticketAntes.titulo}" → "${parsed.data.titulo}"`,
      );
    }
    if (
      parsed.data.descricao !== undefined &&
      parsed.data.descricao !== ticketAntes.descricao
    ) {
      mudancas.push(`<strong>Descrição</strong> foi alterada`);
    }
    if (
      parsed.data.prioridade_id !== undefined &&
      parsed.data.prioridade_id !== ticketAntes.prioridade_id
    ) {
      const novaNome =
        (
          await queryOne<{ nome: string }>(
            `SELECT nome FROM ticket_prioridades WHERE id = $1`,
            [parsed.data.prioridade_id],
          )
        )?.nome ?? "—";
      mudancas.push(
        `<strong>Prioridade:</strong> "${ticketAntes.prioridade_nome}" → "${novaNome}"`,
      );
    }
    if (
      "departamento_id" in parsed.data &&
      (parsed.data.departamento_id ?? null) !==
        (ticketAntes.departamento_id ?? null)
    ) {
      const novaNome = parsed.data.departamento_id
        ? ((
            await queryOne<{ nome: string }>(
              `SELECT nome FROM departamentos WHERE id = $1`,
              [parsed.data.departamento_id],
            )
          )?.nome ?? "—")
        : "—";
      mudancas.push(
        `<strong>Departamento:</strong> "${ticketAntes.departamento_nome ?? "—"}" → "${novaNome}"`,
      );
    }
    if (
      "categoria_id" in parsed.data &&
      (parsed.data.categoria_id ?? null) !== (ticketAntes.categoria_id ?? null)
    ) {
      const novaNome = parsed.data.categoria_id
        ? ((
            await queryOne<{ nome: string }>(
              `SELECT nome FROM categorias WHERE id = $1`,
              [parsed.data.categoria_id],
            )
          )?.nome ?? "—")
        : "—";
      mudancas.push(
        `<strong>Categoria:</strong> "${ticketAntes.categoria_nome ?? "—"}" → "${novaNome}"`,
      );
    }
    if (
      "subcategoria_id" in parsed.data &&
      (parsed.data.subcategoria_id ?? null) !==
        (ticketAntes.subcategoria_id ?? null)
    ) {
      const novaNome = parsed.data.subcategoria_id
        ? ((
            await queryOne<{ nome: string }>(
              `SELECT nome FROM subcategorias WHERE id = $1`,
              [parsed.data.subcategoria_id],
            )
          )?.nome ?? "—")
        : "—";
      mudancas.push(
        `<strong>Subcategoria:</strong> "${ticketAntes.subcategoria_nome ?? "—"}" → "${novaNome}"`,
      );
    }
    if (
      "atribuido_a" in parsed.data &&
      (parsed.data.atribuido_a ?? null) !== (ticketAntes.atribuido_a ?? null)
    ) {
      const novaNome = parsed.data.atribuido_a
        ? ((
            await queryOne<{ nome: string }>(
              `SELECT nome FROM usuarios WHERE id = $1`,
              [parsed.data.atribuido_a],
            )
          )?.nome ?? "—")
        : "Não atribuído";
      mudancas.push(
        `<strong>Atendente:</strong> "${ticketAntes.atribuido_nome ?? "Não atribuído"}" → "${novaNome}"`,
      );
    }
    if (mudancas.length > 0) {
      const corpo = `<p><em>Chamado editado por ${session.nome ?? "Atendente"}</em></p><ul>${mudancas.map((m) => `<li>${m}</li>`).join("")}</ul>`;
      await query(
        `INSERT INTO mensagens (ticket_id, autor_id, corpo, interna) VALUES ($1, $2, $3, true)`,
        [id, session.sub, corpo],
      );
    }
  }

  // Registrar eventos de SLA quando status muda
  if (novoStatus) {
    const deadline = ticketAtual?.sla_resolucao_deadline ?? null;
    const violado = deadline ? new Date() > new Date(deadline) : false;
    if (novoStatus.codigo === "resolvido") {
      await query(
        `INSERT INTO sla_logs (ticket_id, evento, tipo, deadline, violado)
         VALUES ($1, 'resolucao', 'resolucao', $2, $3)`,
        [id, deadline, violado],
      );
    } else if (novoStatus.encerra) {
      await query(
        `INSERT INTO sla_logs (ticket_id, evento, tipo, deadline, violado)
         VALUES ($1, 'encerrado', 'resolucao', $2, $3)`,
        [id, deadline, violado],
      );
    }
    if (ticketAtual?.status_encerra && !novoStatus.encerra) {
      await query(
        `INSERT INTO sla_logs (ticket_id, evento, tipo, deadline, violado)
         VALUES ($1, 'reabertura', 'reabertura', NULL, false)`,
        [id],
      );
    }
  }

  // Notificar atendente que recebeu a transferência (fire-and-forget)
  if (novoAtribuidoAId && ticketInfo) {
    const transferidoPorNome =
      (
        await queryOne<{ nome: string }>(
          `SELECT nome FROM usuarios WHERE id = $1`,
          [session.sub],
        )
      )?.nome ?? "Sistema";

    notificarWhatsappTransferencia({
      empresaId: ticketInfo.empresa_id,
      ticketId: id,
      ticketNumero: ticketInfo.numero,
      ticketTitulo: ticketInfo.titulo,
      prioridadeNome: ticketInfo.prioridade_nome,
      atribuidoAId: novoAtribuidoAId,
      transferidoPorNome,
    });

    // Notificar atendente por email (fire-and-forget)
    queryOne<{ email: string; nome: string }>(
      `SELECT email, nome FROM usuarios WHERE id = $1`,
      [novoAtribuidoAId],
    )
      .then((atendente) => {
        if (atendente?.email) {
          emailTransferenciaTicket({
            emailAtendente: atendente.email,
            nomeAtendente: atendente.nome,
            ticketId: id,
            numeroTicket: ticketInfo!.numero,
            titulo: ticketInfo!.titulo,
            prioridade: ticketInfo!.prioridade_nome,
            transferidoPorNome,
          }).catch((err) => console.error("[email] transferencia:", err));
        }
      })
      .catch((err) => console.error("[email] busca atendente:", err));
  }

  // Notificar cliente por email quando status muda (fire-and-forget)
  if (emailStatusDados) {
    queryOne<{
      numero: string;
      titulo: string;
      cliente_email: string | null;
      cliente_nome: string | null;
    }>(
      `SELECT t.numero, t.titulo, u.email AS cliente_email, c.nome_razao AS cliente_nome
       FROM tickets t
       LEFT JOIN clientes c ON c.id = t.cliente_id
       LEFT JOIN usuario_clientes uc_link ON uc_link.cliente_id = c.id
       LEFT JOIN usuarios u ON u.id = uc_link.usuario_id
       WHERE t.id = $1`,
      [id],
    )
      .then((info) => {
        if (info?.cliente_email) {
          emailMudancaStatus({
            emailCliente: info.cliente_email,
            nomeCliente: info.cliente_nome ?? "Cliente",
            ticketId: id,
            numeroTicket: info.numero,
            titulo: info.titulo,
            statusAnterior: emailStatusDados!.statusAnteriorNome,
            statusNovo: emailStatusDados!.statusNovoNome,
            encerra: emailStatusDados!.statusNovoEncerra,
          }).catch((err) => console.error("[email] mudanca status:", err));
        }
      })
      .catch((err) => console.error("[email] busca ticket status:", err));
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/tickets/[id] — somente admin
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (session.perfil !== "admin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const ticket = await queryOne<{ id: string; status_encerra: boolean }>(
    `SELECT t.id, ts.encerra AS status_encerra
     FROM tickets t JOIN ticket_status ts ON ts.id = t.status_id
     WHERE t.id = $1`,
    [id],
  );
  if (!ticket)
    return NextResponse.json(
      { error: "Ticket não encontrado" },
      { status: 404 },
    );

  if (ticket.status_encerra) {
    return NextResponse.json(
      { error: "Não é possível excluir um chamado finalizado." },
      { status: 422 },
    );
  }

  await query(`DELETE FROM tickets WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
