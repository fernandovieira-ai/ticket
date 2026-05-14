import { NextRequest, NextResponse } from "next/server";
import { queryIntranet } from "@/lib/db-unified";
import { getSession } from "@/lib/auth";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const SECRET = (process.env.HOSPEDAGEM_SECRET ?? "digitalrf_hospedagem_key_32b!").padEnd(32, "0").slice(0, 32);
const IV_LEN = 16;

export function encryptPassword(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-cbc", Buffer.from(SECRET), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decryptPassword(stored: string): string {
  try {
    const [ivHex, encHex] = stored.split(":");
    if (!ivHex || !encHex) return stored; // legado sem criptografia
    const iv = Buffer.from(ivHex, "hex");
    const enc = Buffer.from(encHex, "hex");
    const decipher = createDecipheriv("aes-256-cbc", Buffer.from(SECRET), iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return stored;
  }
}

// GET /api/intranet/hospedagem?cod_grupo=X
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const codGrupo = req.nextUrl.searchParams.get("cod_grupo");
  if (!codGrupo) return NextResponse.json({ error: "cod_grupo obrigatório" }, { status: 400 });

  const result = await queryIntranet(
    `SELECT id, cod_grupo, nom_base, nom_host, nom_usuario, sen_senha, criado_em
     FROM intranet.hospedagem WHERE cod_grupo = $1 ORDER BY nom_base`,
    [parseInt(codGrupo)]
  );

  const rows = result.rows.map((r: any) => ({
    ...r,
    senha_decrypted: r.sen_senha ? decryptPassword(r.sen_senha) : null,
  }));

  return NextResponse.json(rows);
}

// POST /api/intranet/hospedagem
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { cod_grupo, nom_base, nom_host, nom_usuario, sen_senha } = body;

  if (!cod_grupo || !nom_base || !nom_host) {
    return NextResponse.json({ error: "cod_grupo, base e host são obrigatórios" }, { status: 400 });
  }

  const senhaEncrypted = sen_senha ? encryptPassword(sen_senha) : null;

  const result = await queryIntranet(
    `INSERT INTO intranet.hospedagem (cod_grupo, nom_base, nom_host, nom_usuario, sen_senha)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [cod_grupo, nom_base, nom_host, nom_usuario ?? null, senhaEncrypted]
  );

  const row = result.rows[0];
  return NextResponse.json({
    ...row,
    senha_decrypted: row.sen_senha ? decryptPassword(row.sen_senha) : null,
  }, { status: 201 });
}
