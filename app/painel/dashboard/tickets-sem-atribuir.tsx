"use client";

import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import Link from "next/link";
import { UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TicketRow {
  id: string;
  numero: string;
  titulo: string;
  status_nome: string;
  status_cor: string;
  prioridade_nome: string;
  prioridade_cor: string;
  cliente_nome: string | null;
  criado_em: Date;
}

interface Usuario {
  id: string;
  nome: string;
}

const TicketsSemAtribuirComponent = memo(function TicketsSemAtribuir({
  tickets: inicial,
}: {
  tickets: TicketRow[];
}) {
  const [lista, setLista] = useState<TicketRow[]>(inicial);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [atribuindo, setAtribuindo] = useState<string | null>(null); // ticket id com dropdown aberto
  const [salvando, setSalvando] = useState<string | null>(null); // ticket id sendo salvo
  const isMountedRef = useRef(true);

  useEffect(() => {
    let isMounted = true;

    fetch("/api/usuarios?pageSize=100")
      .then((r) => r.json())
      .then((d) => {
        if (!isMounted || !isMountedRef.current) return;
        const lista: Usuario[] = d.data ?? d;
        setUsuarios(lista);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const atribuir = useCallback(async (ticketId: string, usuarioId: string) => {
    if (!isMountedRef.current) return;

    setSalvando(ticketId);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atribuido_a: usuarioId }),
      });

      if (!isMountedRef.current) return;

      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error ?? "Erro ao atribuir");
        return;
      }
      setLista((prev) => prev.filter((t) => t.id !== ticketId));
      setAtribuindo(null);
      toast.success("Chamado atribuído com sucesso");
    } catch {
      if (!isMountedRef.current) return;
      toast.error("Erro de conexão");
    } finally {
      if (isMountedRef.current) {
        setSalvando(null);
      }
    }
  }, []);

  // Memoized usuarios filtering
  const usuariosAtivos = useMemo(() => {
    return usuarios.filter(
      (u: Usuario & { perfil?: string; ativo?: boolean }) =>
        u.perfil !== "cliente" && u.ativo !== false,
    );
  }, [usuarios]);

  // Memoized styles
  const containerStyle = useMemo(() => ({
    fontSize: 13,
    color: "var(--color-text-muted)",
    padding: "16px",
  }), []);

  const itemStyle = useMemo(() => ({
    padding: "10px 16px",
    borderBottom: "0.5px solid var(--color-border)",
  }), []);

  const selectStyle = useMemo(() => ({
    fontSize: 11,
    padding: "3px 6px",
    height: 26,
    borderRadius: 5,
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-bg-primary)",
    color: "var(--color-text)",
    cursor: "pointer",
    outline: "none",
    maxWidth: 140,
  }), []);

  const buttonStyle = useMemo(() => ({
    fontSize: 11,
    color: "var(--color-brand, #2563EB)",
    fontWeight: 500,
    cursor: "pointer",
    padding: "3px 8px",
    borderRadius: 5,
    border: "1px solid var(--color-brand, #2563EB)",
    backgroundColor: "transparent",
    whiteSpace: "nowrap" as const,
  }), []);

  // Memoized handlers
  const handleSelectChange = useCallback((ticketId: string, value: string) => {
    if (value) atribuir(ticketId, value);
  }, [atribuir]);

  const handleCancelAtribuir = useCallback(() => {
    setAtribuindo(null);
  }, []);

  const handleAtribuirClick = useCallback((ticketId: string) => {
    setAtribuindo(ticketId);
  }, []);

  if (lista.length === 0) {
    return (
      <p style={containerStyle}>
        Nenhum chamado sem atendente.
      </p>
    );
  }

  return (
    <div>
      {lista.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-3"
          style={itemStyle}
        >
          {/* Info do ticket */}
          <div className="flex-1 min-w-0">
            <Link href={`/painel/tickets/${t.id}`} className="block group">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--color-text-muted)",
                    letterSpacing: "0.02em",
                  }}
                >
                  #{t.numero}
                </span>
                <span
                  className="truncate group-hover:underline"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {t.titulo}
                </span>
              </div>
              <div
                className="flex items-center gap-2 flex-wrap"
                style={{ marginTop: 4 }}
              >
                <span
                  className="inline-flex items-center"
                  style={{
                    padding: "2px 8px",
                    borderRadius: 20,
                    fontSize: 10,
                    fontWeight: 600,
                    backgroundColor: t.status_cor + "20",
                    color: t.status_cor,
                  }}
                >
                  {t.status_nome}
                </span>
                <span
                  className="inline-flex items-center"
                  style={{
                    padding: "2px 8px",
                    borderRadius: 20,
                    fontSize: 10,
                    fontWeight: 600,
                    backgroundColor: t.prioridade_cor + "20",
                    color: t.prioridade_cor,
                  }}
                >
                  {t.prioridade_nome}
                </span>
                {t.cliente_nome && (
                  <span
                    style={{ fontSize: 11, color: "var(--color-text-muted)" }}
                  >
                    {t.cliente_nome}
                  </span>
                )}
              </div>
            </Link>
          </div>

          {/* Ação de atribuir */}
          <div
            className="flex-shrink-0 flex items-center gap-1"
            style={{ marginTop: 2 }}
          >
            {atribuindo === t.id ? (
              <>
                <select
                  autoFocus
                  defaultValue=""
                  onChange={(e) => handleSelectChange(t.id, e.target.value)}
                  disabled={salvando === t.id}
                  style={selectStyle}
                >
                  <option value="" disabled>
                    Selecionar...
                  </option>
                  {usuariosAtivos.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
                {salvando === t.id ? (
                  <Loader2 size={13} className="animate-spin text-gray-400" />
                ) : (
                  <button
                    onClick={handleCancelAtribuir}
                    style={{
                      fontSize: 10,
                      color: "var(--color-text-muted)",
                      cursor: "pointer",
                      padding: "2px 4px",
                    }}
                  >
                    ✕
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => handleAtribuirClick(t.id)}
                className="flex items-center gap-1"
                style={buttonStyle}
              >
                <UserPlus size={11} />
                Atribuir
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
});

export { TicketsSemAtribuirComponent as TicketsSemAtribuir };
