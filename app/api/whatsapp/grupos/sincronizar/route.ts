import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { getEvolutionConfig } from "@/lib/whatsapp";

interface EvolutionGroup {
  id: string;           // JID ex: 120363xxxxx@g.us
  subject: string;      // nome do grupo
  subjectOwner?: string;
  pictureUrl?: string;
  size?: number;        // total de membros
  desc?: string;
}

// POST /api/whatsapp/grupos/sincronizar
// Busca grupos da Evolution API e faz upsert em whatsapp_grupos.
// Body: { instancia_id: string }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { instancia_id } = await req.json();
  if (!instancia_id)
    return NextResponse.json({ error: "instancia_id é obrigatório" }, { status: 400 });

  // Verifica que a instância pertence à empresa
  const instancia = await queryOne<{ id: string; nome_instancia: string; status: string }>(
    `SELECT id, nome_instancia, status FROM whatsapp_instancias
     WHERE id = $1 AND empresa_id = $2`,
    [instancia_id, session.empresaId]
  );
  if (!instancia)
    return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });
  if (instancia.status !== "conectado")
    return NextResponse.json({ error: "Instância não está conectada" }, { status: 409 });

  const evo = await getEvolutionConfig(session.empresaId);
  if (!evo)
    return NextResponse.json({ error: "Evolution API não configurada" }, { status: 422 });

  // Busca grupos na Evolution API
  let grupos: EvolutionGroup[] = [];
  try {
    const resp = await fetch(
      `${evo.url}/group/fetchAllGroups/${instancia.nome_instancia}?getParticipants=false`,
      { headers: { apikey: evo.key } }
    );
    if (!resp.ok) throw new Error(`Evolution API retornou ${resp.status}`);
    const data = await resp.json();
    grupos = Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[grupos/sincronizar]", err);
    return NextResponse.json({ error: "Falha ao comunicar com Evolution API" }, { status: 502 });
  }

  // Remove caracteres Unicode que não existem em LATIN1 (ex: U+200E, emojis, etc.)
  function latin1safe(str: string | null | undefined): string | null {
    if (!str) return null;
    return str.replace(/[^\x00-\xFF]/g, "").trim() || null;
  }

  // Upsert de cada grupo
  let inseridos = 0;
  let atualizados = 0;

  for (const g of grupos) {
    if (!g.id?.endsWith("@g.us") || !g.subject) continue;

    const nome     = latin1safe(g.subject) ?? g.subject.substring(0, 255);
    const descricao = latin1safe(g.desc);
    const fotoUrl  = latin1safe(g.pictureUrl);

    const existente = await queryOne<{ id: string }>(
      `SELECT id FROM whatsapp_grupos WHERE instancia_id = $1 AND group_jid = $2`,
      [instancia_id, g.id]
    );

    if (existente) {
      await query(
        `UPDATE whatsapp_grupos
         SET nome = $1, descricao = $2, foto_url = $3,
             total_membros = $4, sincronizado_em = NOW(), atualizado_em = NOW()
         WHERE id = $5`,
        [nome, descricao, fotoUrl, g.size ?? 0, existente.id]
      );
      atualizados++;
    } else {
      await query(
        `INSERT INTO whatsapp_grupos
           (empresa_id, instancia_id, group_jid, nome, descricao, foto_url, total_membros, sincronizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [session.empresaId, instancia_id, g.id, nome, descricao, fotoUrl, g.size ?? 0]
      );
      inseridos++;
    }
  }

  // Busca fotos dos grupos que não têm foto_url (até 50 por vez, best-effort)
  const semFoto = await query<{ id: string; group_jid: string }>(
    `SELECT id, group_jid FROM whatsapp_grupos
     WHERE instancia_id = $1 AND foto_url IS NULL
     LIMIT 50`,
    [instancia_id]
  );
  let fotosCarregadas = 0;
  for (const g of semFoto) {
    try {
      const r = await fetch(
        `${evo.url}/chat/fetchProfilePictureUrl/${instancia.nome_instancia}?number=${encodeURIComponent(g.group_jid)}`,
        { headers: { apikey: evo.key }, signal: AbortSignal.timeout(5_000) }
      );
      if (r.ok) {
        const data = await r.json();
        const fotoUrl: string | null = data?.profilePictureUrl ?? data?.wuid ?? null;
        if (fotoUrl) {
          await query(`UPDATE whatsapp_grupos SET foto_url = $1 WHERE id = $2`, [fotoUrl, g.id]);
          fotosCarregadas++;
        }
      }
    } catch {
      // ignora falha individual — foto fica null e será tentada novamente no próximo sync
    }
  }

  return NextResponse.json({
    ok: true,
    total: grupos.length,
    inseridos,
    atualizados,
    fotos_carregadas: fotosCarregadas,
  });
}
