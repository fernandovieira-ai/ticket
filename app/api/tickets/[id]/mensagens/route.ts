import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { emailNovaResposta } from "@/lib/email/send";

const enviarMensagemSchema = z.object({
  corpo: z.string().min(1).max(10000),
  interna: z.boolean().optional().default(false),
});

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
]);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB por arquivo

// GET /api/tickets/[id]/mensagens
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  // Verifica acesso ao ticket
  const ticket = await queryOne<{ id: string; cliente_id: string | null }>(
    `SELECT id, cliente_id FROM tickets WHERE id = $1`,
    [id],
  );
  if (!ticket)
    return NextResponse.json(
      { error: "Ticket não encontrado" },
      { status: 404 },
    );

  if (session.perfil === "cliente") {
    const cli = await queryOne<{ id: string }>(
      `SELECT c.id FROM clientes c
       JOIN usuario_clientes uc ON uc.cliente_id = c.id
       WHERE uc.usuario_id = $1
         AND c.empresa_id = $2
       LIMIT 1`,
      [session.sub, session.empresaId],
    );
    if (!cli || cli.id !== ticket.cliente_id) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
  }

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
    `SELECT
       m.id, m.corpo, m.interna, m.criado_em,
       u.id AS autor_id, u.nome AS autor_nome, u.perfil AS autor_perfil, u.avatar_url AS autor_avatar
     FROM mensagens m
     JOIN usuarios u ON u.id = m.autor_id
     WHERE m.ticket_id = $1
       AND ($2 = true OR m.interna = false)
     ORDER BY m.criado_em ASC`,
    [id, session.perfil !== "cliente"],
  );

  // Busca anexos de todas as mensagens retornadas
  if (mensagens.length > 0) {
    const ids = mensagens.map((m) => m.id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    const anexos = await query<{
      id: string;
      mensagem_id: string;
      nome: string;
      url: string;
      tamanho: number | null;
      mime_type: string | null;
    }>(
      `SELECT id, mensagem_id, nome, url, tamanho, mime_type FROM anexos_mensagem WHERE mensagem_id IN (${placeholders})`,
      ids,
    );
    const anexosPorMensagem = new Map<string, typeof anexos>();
    for (const a of anexos) {
      const list = anexosPorMensagem.get(a.mensagem_id) ?? [];
      list.push(a);
      anexosPorMensagem.set(a.mensagem_id, list);
    }
    return NextResponse.json(
      mensagens.map((m) => ({
        ...m,
        anexos: anexosPorMensagem.get(m.id) ?? [],
      })),
    );
  }

  return NextResponse.json(mensagens.map((m) => ({ ...m, anexos: [] })));
}

// POST /api/tickets/[id]/mensagens
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (session.perfil === "somente_leitura") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;

  const ticket = await queryOne<{
    id: string;
    cliente_id: string | null;
    status_id: string;
    respondido_em: Date | null;
    sla_primeira_resp_deadline: Date | null;
  }>(`SELECT id, cliente_id, status_id, respondido_em, sla_primeira_resp_deadline FROM tickets WHERE id = $1 AND empresa_id = $2`, [id, session.empresaId]);
  if (!ticket)
    return NextResponse.json(
      { error: "Ticket não encontrado" },
      { status: 404 },
    );

  if (session.perfil === "cliente") {
    const cli = await queryOne<{ id: string }>(
      `SELECT c.id FROM clientes c
       JOIN usuario_clientes uc ON uc.cliente_id = c.id
       WHERE uc.usuario_id = $1
         AND c.empresa_id = $2
       LIMIT 1`,
      [session.sub, session.empresaId],
    );
    if (!cli || cli.id !== ticket.cliente_id) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
  }

  const contentType = req.headers.get("content-type") ?? "";
  let corpo: string;
  let interna: boolean;
  let uploadedFiles: Array<{
    nome: string;
    url: string;
    tamanho: number;
    mime_type: string;
  }> = [];

  if (contentType.includes("multipart/form-data")) {
    // Processa multipart
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
    }

    corpo = (formData.get("corpo") as string | null) ?? "";
    interna = formData.get("interna") === "true";

    const parsed = enviarMensagemSchema.safeParse({ corpo, interna });
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const files = formData.getAll("arquivos") as File[];
    // Usa volume persistente no Railway ou public local
    const uploadDir = process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "tickets", id)
      : path.join(process.cwd(), "public", "uploads", "tickets", id);

    // Criar diretório com tratamento de erro
    try {
      await mkdir(uploadDir, { recursive: true });
      console.log(`[UPLOAD] Diretório criado/verificado: ${uploadDir}`);
    } catch (error) {
      console.error(`[UPLOAD] Erro ao criar diretório ${uploadDir}:`, error);
      return NextResponse.json(
        { error: "Erro ao preparar diretório de upload" },
        { status: 500 }
      );
    }

    for (const file of files) {
      // Validações de segurança
      if (!ALLOWED_MIME.has(file.type)) continue;
      if (file.size > MAX_FILE_SIZE) continue;

      const ext = path.extname(file.name).replace(/[^a-zA-Z0-9.]/g, "");
      const safeName = `${randomUUID()}${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(uploadDir, safeName), buffer);
      uploadedFiles.push({
        nome: file.name,
        url: `/uploads/tickets/${id}/${safeName}`,
        tamanho: file.size,
        mime_type: file.type,
      });
    }

    interna = session.perfil === "cliente" ? false : parsed.data.interna;
    corpo = parsed.data.corpo;
  } else {
    // JSON simples (sem arquivos)
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const parsed = enviarMensagemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    interna = session.perfil === "cliente" ? false : parsed.data.interna;
    corpo = parsed.data.corpo;
  }

  // Sanitizar caracteres especiais para compatibilidade com LATIN1
  const corpoSanitizado = corpo
    // Substitui caracteres especiais comuns por equivalentes ASCII
    .replace(/[""]/g, '"')           // Aspas curvas -> aspas normais
    .replace(/['']/g, "'")           // Apóstrofes curvos -> apóstrofe normal
    .replace(/[–—]/g, "-")           // Travessões -> hífen
    .replace(/→/g, "->")             // Seta -> seta ASCII
    .replace(/←/g, "<-")             // Seta esquerda -> seta ASCII
    .replace(/…/g, "...")            // Reticências -> três pontos
    .replace(/º/g, "o")              // Símbolo masculino -> o
    .replace(/ª/g, "a")              // Símbolo feminino -> a
    .replace(/°/g, "o")              // Graus -> o
    .replace(/©/g, "(c)")            // Copyright -> (c)
    .replace(/®/g, "(R)")            // Marca registrada -> (R)
    .replace(/™/g, "(TM)")           // Trademark -> (TM)
    .replace(/§/g, "par.")           // Parágrafo -> par.
    // Remove acentos mantendo as letras
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")           // Remove diacríticos (acentos)
    .replace(/[^\x00-\x7F]/g, "?");  // Substitui caracteres restantes por ?

  const [mensagem] = await query<{ id: string; criado_em: Date }>(
    `INSERT INTO mensagens (ticket_id, autor_id, corpo, interna) VALUES ($1, $2, $3, $4) RETURNING id, criado_em`,
    [id, session.sub, corpoSanitizado, interna],
  );

  // Salva anexos no banco
  if (uploadedFiles.length > 0) {
    for (const f of uploadedFiles) {
      await query(
        `INSERT INTO anexos_mensagem (mensagem_id, nome, url, tamanho, mime_type) VALUES ($1, $2, $3, $4, $5)`,
        [mensagem.id, f.nome, f.url, f.tamanho, f.mime_type],
      );
    }
  }

  // Atualiza atualizado_em do ticket
  await query(`UPDATE tickets SET atualizado_em = now() WHERE id = $1`, [id]);

  // Se operador/admin responde, marca primeira resposta e avalia SLA
  if (session.perfil !== "cliente") {
    const isPrimeiraResposta = !ticket.respondido_em;
    await query(
      `UPDATE tickets
         SET respondido_em        = COALESCE(respondido_em, now()),
             sla_primeira_resp_ok = CASE
               WHEN respondido_em IS NULL
               THEN (now() <= COALESCE(sla_primeira_resp_deadline, 'infinity'::timestamptz))
               ELSE sla_primeira_resp_ok
             END
       WHERE id = $1`,
      [id],
    );
    if (isPrimeiraResposta) {
      const deadline = ticket.sla_primeira_resp_deadline;
      const violado = deadline ? new Date() > new Date(deadline) : false;
      await query(
        `INSERT INTO sla_logs (ticket_id, evento, tipo, deadline, violado)
         VALUES ($1, 'primeira_resposta', 'resposta', $2, $3)`,
        [id, deadline, violado],
      );
    }
  }

  // Notificar por email (fire-and-forget — não bloqueia a resposta)
  if (!interna) {
    queryOne<{
      numero: string;
      titulo: string;
      cliente_email: string | null;
      cliente_nome: string | null;
      atribuido_email: string | null;
      atribuido_nome: string | null;
    }>(
      `SELECT t.numero, t.titulo,
              uc.email AS cliente_email, c.nome_razao AS cliente_nome,
              ua.email AS atribuido_email, ua.nome AS atribuido_nome
       FROM tickets t
       LEFT JOIN clientes c ON c.id = t.cliente_id
       LEFT JOIN usuario_clientes uc_link ON uc_link.cliente_id = c.id
       LEFT JOIN usuarios uc ON uc.id = uc_link.usuario_id
       LEFT JOIN usuarios ua ON ua.id = t.atribuido_a
       WHERE t.id = $1`,
      [id],
    )
      .then(async (info) => {
        if (!info) return;
        const remetenteNome =
          (
            await queryOne<{ nome: string }>(
              `SELECT nome FROM usuarios WHERE id = $1`,
              [session.sub],
            )
          )?.nome ?? "Atendente";

        if (session.perfil === "cliente" && info.atribuido_email) {
          // Cliente respondeu → notifica o atendente
          emailNovaResposta({
            emailDestinatario: info.atribuido_email,
            nomeDestinatario: info.atribuido_nome ?? "Atendente",
            ticketId: id,
            numeroTicket: info.numero,
            titulo: info.titulo,
            nomeRemetente: remetenteNome,
            mensagem: corpo,
            perfil: "atendente",
          }).catch((err) =>
            console.error("[email] resposta para atendente:", err),
          );
        } else if (session.perfil !== "cliente" && info.cliente_email) {
          // Atendente/admin respondeu → notifica o cliente
          emailNovaResposta({
            emailDestinatario: info.cliente_email,
            nomeDestinatario: info.cliente_nome ?? "Cliente",
            ticketId: id,
            numeroTicket: info.numero,
            titulo: info.titulo,
            nomeRemetente: remetenteNome,
            mensagem: corpo,
            perfil: "cliente",
          }).catch((err) =>
            console.error("[email] resposta para cliente:", err),
          );
        }
      })
      .catch((err) => console.error("[email] busca ticket mensagem:", err));
  }

  return NextResponse.json(
    { ...mensagem, anexos: uploadedFiles },
    { status: 201 },
  );
}
