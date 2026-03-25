import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { getEvolutionConfig } from "@/lib/whatsapp";

// GET /api/whatsapp/grupos/debug
// Retorna instâncias conectadas e grupos disponíveis na Evolution API (sem salvar nada).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const evo = await getEvolutionConfig(session.empresaId);
  if (!evo) return NextResponse.json({ error: "Evolution API não configurada" }, { status: 422 });

  // Instâncias no banco
  const instancias = await query<{
    id: string;
    nome_instancia: string;
    numero: string | null;
    status: string;
  }>(
    `SELECT id, nome_instancia, numero, status
     FROM whatsapp_instancias
     WHERE empresa_id = $1 AND ativo = TRUE
     ORDER BY criado_em ASC`,
    [session.empresaId]
  );

  const resultado = [];

  for (const inst of instancias) {
    let grupos: unknown[] = [];
    let erroGrupos: string | null = null;
    let numeroConectado: string | null = inst.numero;

    // Tenta buscar o número conectado direto da Evolution API
    try {
      const infoResp = await fetch(
        `${evo.url}/instance/fetchInstances`,
        { headers: { apikey: evo.key } }
      );
      if (infoResp.ok) {
        const lista = await infoResp.json() as Array<Record<string, unknown>>;
        const found = lista.find(
          (i) => (i.instance as Record<string, unknown>)?.instanceName === inst.nome_instancia
        );
        const owner = (found?.instance as Record<string, unknown>)?.owner as string | undefined;
        if (owner) {
          // owner vem como "5511999...@s.whatsapp.net" ou só o número
          numeroConectado = owner.replace("@s.whatsapp.net", "").replace(/\D/g, "");
          // Atualiza no banco se mudou
          if (numeroConectado !== inst.numero) {
            await query(
              `UPDATE whatsapp_instancias SET numero = $1 WHERE id = $2`,
              [numeroConectado, inst.id]
            );
          }
        }
      }
    } catch {
      // ignora, usa o que está no banco
    }

    // Busca grupos da instância
    if (inst.status === "conectado") {
      try {
        const resp = await fetch(
          `${evo.url}/group/fetchAllGroups/${inst.nome_instancia}?getParticipants=false`,
          { headers: { apikey: evo.key } }
        );
        if (resp.ok) {
          const data = await resp.json();
          grupos = Array.isArray(data) ? data.map((g: Record<string, unknown>) => ({
            jid:         g.id,
            nome:        g.subject,
            descricao:   g.desc ?? null,
            membros:     g.size ?? 0,
            foto:        g.pictureUrl ?? null,
            criado_em:   g.creation ? new Date((g.creation as number) * 1000).toISOString() : null,
          })) : [];
        } else {
          erroGrupos = `Evolution retornou ${resp.status}`;
        }
      } catch (err) {
        erroGrupos = err instanceof Error ? err.message : "Erro ao buscar grupos";
      }
    } else {
      erroGrupos = `Instância ${inst.status} — conecte primeiro`;
    }

    resultado.push({
      instancia: {
        id:             inst.id,
        nome:           inst.nome_instancia,
        numero:         numeroConectado,
        status:         inst.status,
      },
      total_grupos: grupos.length,
      grupos,
      erro: erroGrupos,
    });
  }

  return NextResponse.json(resultado);
}
