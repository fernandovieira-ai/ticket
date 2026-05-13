import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { writeFile, mkdir, unlink, readFile } from "fs/promises";
import { join, basename } from "path";
import { randomUUID } from "crypto";

type Params = { params: Promise<{ id: string }> };

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

function faqImgDir() {
  return process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "intranet", "faq")
    : join(process.cwd(), "public", "uploads", "intranet", "faq");
}

// GET /api/intranet/faq/[id]/imagem — serve a imagem diretamente
export async function GET(
  _req: NextRequest,
  { params }: Params
) {
  const session = await getSession();
  if (!session) return new NextResponse("Não autenticado", { status: 401 });

  const { id } = await params;

  const row = await queryOne<{
    imagem: Buffer | null;
    tipo_arquivo: string | null;
    caminho_arquivo: string | null;
  }>(
    "SELECT imagem, tipo_arquivo, caminho_arquivo FROM intranet.faq WHERE id = $1",
    [id]
  );

  if (!row) return new NextResponse("Not found", { status: 404 });

  const contentType = row.tipo_arquivo ?? "image/jpeg";

  // Arquivo salvo no filesystem (novo padrão)
  if (row.caminho_arquivo) {
    // Suporta tanto path absoluto quanto relativo (uploads/faq/uuid.jpg)
    const candidates = [
      row.caminho_arquivo,                                          // path original
      join(faqImgDir(), basename(row.caminho_arquivo)),            // diretório atual (intranet/faq)
      join(process.cwd(), "public", basename(row.caminho_arquivo)), // public/ raiz
      join(process.cwd(), "public", row.caminho_arquivo),          // public/uploads/faq/...
    ];
    for (const candidate of candidates) {
      try {
        const data = await readFile(candidate);
        return new NextResponse(data, {
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(data.length),
            "Cache-Control": "private, no-cache",
          },
        });
      } catch {
        // tenta próximo candidate
      }
    }
    // nenhum candidate funcionou — cai no bytea abaixo
  }

  // Fallback: bytea legado
  if (row.imagem) {
    // pg retorna bytea como Buffer; garantimos instância válida
    const buf = Buffer.isBuffer(row.imagem)
      ? row.imagem
      : Buffer.from(row.imagem as unknown as ArrayBuffer);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buf.length),
      },
    });
  }

  return new NextResponse("Imagem não encontrada", { status: 404 });
}

// POST /api/intranet/faq/[id]/imagem — salva no filesystem, igual tickets
export async function POST(
  req: NextRequest,
  { params }: Params
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
  }

  const file = formData.get("imagem") as File | null;
  if (!file) return NextResponse.json({ error: "Nenhuma imagem enviada" }, { status: 400 });

  const allowed = Object.keys(MIME_EXT);
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "Tipo não permitido (jpeg, png, gif, webp)" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Imagem deve ter no máximo 5MB" }, { status: 400 });
  }

  // Remove arquivo anterior se existir
  const existing = await queryOne<{ caminho_arquivo: string | null }>(
    "SELECT caminho_arquivo FROM intranet.faq WHERE id = $1",
    [id]
  );
  if (existing?.caminho_arquivo) {
    try {
      await unlink(existing.caminho_arquivo);
    } catch {
      // ignora se não existir
    }
  }

  const dir = faqImgDir();
  await mkdir(dir, { recursive: true });

  const ext = MIME_EXT[file.type];
  const filename = `${randomUUID()}${ext}`;
  const filePath = join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  // Salva caminho, limpa bytea antigo
  await query(
    "UPDATE intranet.faq SET caminho_arquivo = $1, tipo_arquivo = $2, imagem = NULL WHERE id = $3",
    [filePath, file.type, id]
  );

  return NextResponse.json({ ok: true, filename });
}

// DELETE /api/intranet/faq/[id]/imagem — remove arquivo e limpa DB
export async function DELETE(
  _req: NextRequest,
  { params }: Params
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  const row = await queryOne<{ caminho_arquivo: string | null }>(
    "SELECT caminho_arquivo FROM intranet.faq WHERE id = $1",
    [id]
  );

  if (row?.caminho_arquivo) {
    try {
      await unlink(row.caminho_arquivo);
    } catch {
      // ignora se arquivo não existir no disco
    }
  }

  await query(
    "UPDATE intranet.faq SET imagem = NULL, tipo_arquivo = NULL, caminho_arquivo = NULL WHERE id = $1",
    [id]
  );
  return NextResponse.json({ ok: true });
}

