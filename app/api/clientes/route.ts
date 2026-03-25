import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { Cliente } from "@/types";

const criarClienteSchema = z.object({
  nome_razao: z.string().min(2).max(200),
  tipo: z.enum(["J", "F"]).optional(),
  documento: z.string().max(20).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  telefone: z.string().max(30).optional().nullable(),
  segmento: z.string().max(100).optional().nullable(),
  observacoes: z.string().optional().nullable(),
  cep: z.string().max(10).optional().nullable(),
  logradouro: z.string().max(150).optional().nullable(),
  numero: z.string().max(20).optional().nullable(),
  complemento: z.string().max(60).optional().nullable(),
  bairro: z.string().max(80).optional().nullable(),
  cidade: z.string().max(80).optional().nullable(),
  uf: z.string().max(2).optional().nullable(),
  ativo: z.boolean().optional(),
});

// GET /api/clientes
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { searchParams } = req.nextUrl;
    const busca = searchParams.get("q") ?? "";
    const usuarioId = searchParams.get("usuario_id") ?? "";
    const pagina = Math.max(1, Number(searchParams.get("page") ?? 1));
    const tamanho = Math.min(
      50,
      Math.max(5, Number(searchParams.get("pageSize") ?? 20)),
    );
    const offset = (pagina - 1) * tamanho;

    const rows = await query<Cliente & { total_count: number }>(
      `SELECT c.*, COUNT(*) OVER() AS total_count
       FROM clientes c
       LEFT JOIN usuario_clientes uc
         ON uc.cliente_id = c.id AND uc.usuario_id = NULLIF($3, '')::uuid
       WHERE c.empresa_id = $1
         AND ($2 = '' OR
              c.nome_razao ILIKE $2 OR
              c.documento ILIKE $2 OR
              c.email ILIKE $2)
         AND ($3 = '' OR uc.cliente_id IS NOT NULL)
       ORDER BY c.nome_razao
       LIMIT $4 OFFSET $5`,
      [
        session.empresaId,
        busca ? `%${busca}%` : "",
        usuarioId,
        tamanho,
        offset,
      ],
    );

    return NextResponse.json({
      data: rows,
      total: rows[0]?.total_count ?? 0,
      page: pagina,
      pageSize: tamanho,
    });
  } catch (err) {
    console.error("[GET /api/clientes]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/clientes
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const parsed = criarClienteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", detalhes: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      nome_razao,
      tipo,
      documento,
      email,
      telefone,
      segmento,
      observacoes,
      cep,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
      ativo,
    } = parsed.data;

    const [cliente] = await query<Cliente>(
      `INSERT INTO clientes
         (empresa_id, nome_razao, tipo, documento, email, telefone, segmento, observacoes,
          cep, logradouro, numero, complemento, bairro, cidade, uf, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        session.empresaId,
        nome_razao,
        tipo ?? "J",
        documento ?? null,
        email ?? null,
        telefone ?? null,
        segmento ?? null,
        observacoes ?? null,
        cep ?? null,
        logradouro ?? null,
        numero ?? null,
        complemento ?? null,
        bairro ?? null,
        cidade ?? null,
        uf ?? null,
        ativo ?? true,
      ],
    );

    return NextResponse.json(cliente, { status: 201 });
  } catch (err) {
    console.error("[POST /api/clientes]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
