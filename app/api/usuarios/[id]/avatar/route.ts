import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

function avatarDir() {
  return process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "avatars")
    : join(process.cwd(), "public", "uploads", "avatars");
}

// POST /api/usuarios/[id]/avatar
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;

  const usuario = await queryOne<{ id: string; avatar_url: string | null }>(
    "SELECT id, avatar_url FROM usuarios WHERE id = $1 AND empresa_id = $2",
    [id, session.empresaId]
  );
  if (!usuario)
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file)
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: "Tipo inválido. Use PNG, JPG ou WebP" }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "Arquivo muito grande (máx 2MB)" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const filename = `${randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const dir = avatarDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);

  const url = `/uploads/avatars/${filename}`;

  if (usuario.avatar_url) {
    const oldFile = usuario.avatar_url.split("/").pop();
    if (oldFile) unlink(join(dir, oldFile)).catch(() => {});
  }

  await query("UPDATE usuarios SET avatar_url = $1 WHERE id = $2", [url, id]);

  return NextResponse.json({ url });
}

// DELETE /api/usuarios/[id]/avatar
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;

  const usuario = await queryOne<{ id: string; avatar_url: string | null }>(
    "SELECT id, avatar_url FROM usuarios WHERE id = $1 AND empresa_id = $2",
    [id, session.empresaId]
  );
  if (!usuario)
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  if (usuario.avatar_url) {
    const dir = avatarDir();
    const oldFile = usuario.avatar_url.split("/").pop();
    if (oldFile) unlink(join(dir, oldFile)).catch(() => {});
  }

  await query("UPDATE usuarios SET avatar_url = NULL WHERE id = $1", [id]);

  return NextResponse.json({ ok: true });
}

  // Verifica se usuário pertence à empresa
  const usuario = await queryOne<{ id: string; avatar_url: string | null }>(
    "SELECT id, avatar_url FROM usuarios WHERE id = $1 AND empresa_id = $2",
    [id, session.empresaId]
  );
  if (!usuario)
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file)
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json(
      { error: "Tipo inválido. Use PNG, JPG ou WebP" },
      { status: 400 }
    );
  if (file.size > MAX_SIZE)
    return NextResponse.json(
      { error: "Arquivo muito grande (máx 2MB)" },
      { status: 400 }
    );

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const filename = `${randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadDir = join(process.cwd(), "public", "uploads", "avatars");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, filename), buffer);

  const url = `/uploads/avatars/${filename}`;

  // Remove arquivo antigo se existir
  if (usuario.avatar_url) {
    const oldPath = join(process.cwd(), "public", usuario.avatar_url);
    unlink(oldPath).catch(() => {}); // silencioso se não existir
  }

  await query("UPDATE usuarios SET avatar_url = $1 WHERE id = $2", [url, id]);

  return NextResponse.json({ url });
}

// DELETE /api/usuarios/[id]/avatar
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;

  const usuario = await queryOne<{ id: string; avatar_url: string | null }>(
    "SELECT id, avatar_url FROM usuarios WHERE id = $1 AND empresa_id = $2",
    [id, session.empresaId]
  );
  if (!usuario)
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  if (usuario.avatar_url) {
    const oldPath = join(process.cwd(), "public", usuario.avatar_url);
    unlink(oldPath).catch(() => {});
  }

  await query("UPDATE usuarios SET avatar_url = NULL WHERE id = $1", [id]);

  return NextResponse.json({ ok: true });
}
