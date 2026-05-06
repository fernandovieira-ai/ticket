import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

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

// POST /api/tickets/[id]/anexos — salva arquivos em anexos_ticket
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  // Verifica se o ticket existe e pertence à empresa
  const ticket = await queryOne<{ id: string; aberto_por: string }>(
    `SELECT id, aberto_por FROM tickets WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId],
  );
  if (!ticket)
    return NextResponse.json(
      { error: "Ticket não encontrado" },
      { status: 404 },
    );

  // Clientes só podem anexar em tickets que eles mesmos abriram
  if (session.perfil === "cliente" && ticket.aberto_por !== session.sub)
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
  }

  const files = formData.getAll("arquivos") as File[];
  if (files.length === 0)
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });

  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "tickets",
    id,
  );
  await mkdir(uploadDir, { recursive: true });

  const salvos: Array<{
    id: string;
    nome: string;
    url: string;
    tamanho: number;
    mime_type: string;
  }> = [];

  for (const file of files) {
    if (!ALLOWED_MIME.has(file.type)) continue;
    if (file.size > MAX_FILE_SIZE) continue;

    const ext = path.extname(file.name).replace(/[^a-zA-Z0-9.]/g, "");
    const safeName = `${randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, safeName), buffer);

    const url = `/uploads/tickets/${id}/${safeName}`;
    const [row] = await query<{ id: string }>(
      `INSERT INTO anexos_ticket (ticket_id, nome, url, tamanho, mime_type, enviado_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [id, file.name, url, file.size, file.type, session.sub],
    );
    salvos.push({
      id: row.id,
      nome: file.name,
      url,
      tamanho: file.size,
      mime_type: file.type
    });
  }

  // Cria uma mensagem automática para que os anexos apareçam no histórico
  if (salvos.length > 0) {
    const nomeAnexos = salvos.map(a => a.nome).join(", ");
    const corpoMensagem = `📎 Anexou ${salvos.length === 1 ? 'o arquivo' : 'os arquivos'}: ${nomeAnexos}`;

    const [mensagem] = await query<{ id: string }>(
      `INSERT INTO mensagens (ticket_id, autor_id, corpo, interna)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [id, session.sub, corpoMensagem, false],
    );

    // Salva os anexos também na tabela anexos_mensagem para aparecerem no histórico
    for (const anexo of salvos) {
      await query(
        `INSERT INTO anexos_mensagem (mensagem_id, nome, url, tamanho, mime_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          mensagem.id,
          anexo.nome,
          anexo.url,
          anexo.tamanho,
          anexo.mime_type
        ],
      );
    }

    // Atualiza o timestamp do ticket
    await query(`UPDATE tickets SET atualizado_em = now() WHERE id = $1`, [id]);
  }

  return NextResponse.json(
    {
      anexos: salvos.map(s => ({ id: s.id, nome: s.nome, url: s.url }))
    },
    { status: 201 }
  );
}

// GET /api/tickets/[id]/anexos — lista anexos do ticket
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  const ticket = await queryOne<{ id: string; aberto_por: string }>(
    `SELECT id, aberto_por FROM tickets WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId],
  );
  if (!ticket)
    return NextResponse.json(
      { error: "Ticket não encontrado" },
      { status: 404 },
    );

  if (session.perfil === "cliente" && ticket.aberto_por !== session.sub)
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const anexos = await query<{
    id: string;
    nome: string;
    url: string;
    tamanho: number | null;
    mime_type: string | null;
    criado_em: Date;
    enviado_por_nome: string;
  }>(
    `SELECT a.id, a.nome, a.url, a.tamanho, a.mime_type, a.criado_em,
            u.nome AS enviado_por_nome
     FROM anexos_ticket a
     JOIN usuarios u ON u.id = a.enviado_por
     WHERE a.ticket_id = $1
     ORDER BY a.criado_em ASC`,
    [id],
  );

  return NextResponse.json(anexos);
}
