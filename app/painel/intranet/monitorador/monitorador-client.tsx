"use client";

import { useState, useMemo, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  MemoryStick,
  PlayCircle,
  XCircle,
  Server,
  Network,
  RefreshCw,
  Lock,
  Unlock,
  Pencil,
  Save,
  X as XIcon,
} from "lucide-react";

// Adiciona animação CSS para o toast
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  if (!document.querySelector('style[data-toast-animation]')) {
    style.setAttribute('data-toast-animation', 'true');
    document.head.appendChild(style);
  }
}

interface Processo {
  id: number;
  machine_uuid: string;
  machine_id: string;
  process_local_id: string;
  process_name: string;
  process_label: string;
  watch_type: string;
  auto_restart: boolean;
  log_enabled: boolean;
  log_path: string | null;
  log_timeout_min: number;
  ativo: boolean;
  configurado_em: string;
  atualizado_em: string;
}

interface Heartbeat {
  machine_uuid: string;
  machine_id: string;
  machine_ip: string;
  ultimo_contato: string;
  cpu_percent: number;
  mem_percent: number;
  total_processos: number;
  proc_rodando: number;
  proc_parado: number;
  status: string;
}

interface Empresa {
  machine_uuid: string;
  machine_id: string;
  machine_ip: string;
  nome_rede: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  situacao_cadastral: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  configurado_em: string;
  atualizado_em: string;
  heartbeat?: Heartbeat;
  processos: Processo[];
}

interface Rede {
  nomeRede: string;
  empresas: Empresa[];
}

interface Props {
  inicial: Rede[];
  podeEditar: boolean;
}

export default function MonitoradorClient({ inicial, podeEditar }: Props) {
  const [dados, setDados] = useState<Rede[]>(inicial);
  const [redesAbertas, setRedesAbertas] = useState<Set<string>>(new Set());
  const [empresasAbertas, setEmpresasAbertas] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [alterandoStatus, setAlterandoStatus] = useState<string | null>(null);
  const [alterandoProcesso, setAlterandoProcesso] = useState<number | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [editandoRede, setEditandoRede] = useState<string | null>(null);
  const [novoNomeRede, setNovoNomeRede] = useState("");
  const [salvandoRede, setSalvandoRede] = useState(false);

  const toggleRede = (nomeRede: string) => {
    setRedesAbertas(prev => {
      const novas = new Set(prev);
      if (novas.has(nomeRede)) {
        novas.delete(nomeRede);
      } else {
        novas.add(nomeRede);
      }
      return novas;
    });
  };

  const toggleEmpresa = (cnpj: string) => {
    setEmpresasAbertas(prev => {
      const novas = new Set(prev);
      if (novas.has(cnpj)) {
        novas.delete(cnpj);
      } else {
        novas.add(cnpj);
      }
      return novas;
    });
  };

  const atualizar = async () => {
    setAtualizando(true);
    try {
      const res = await fetch("/api/intranet/monitorador");
      if (res.ok) {
        const novosDados = await res.json();
        setDados(novosDados);
      }
    } catch (error) {
      console.error("Erro ao atualizar dados:", error);
    } finally {
      setAtualizando(false);
    }
  };

  const alterarStatus = async (machineUuid: string, novoStatus: string) => {
    if (!podeEditar) return;

    setAlterandoStatus(machineUuid);
    try {
      const res = await fetch(`/api/intranet/monitorador/${machineUuid}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao_cadastral: novoStatus }),
      });

      if (res.ok) {
        const response = await res.json();

        // Atualiza localmente
        setDados(prev =>
          prev.map(rede => ({
            ...rede,
            empresas: rede.empresas.map(emp =>
              emp.machine_uuid === machineUuid
                ? { ...emp, situacao_cadastral: novoStatus }
                : emp
            ),
          }))
        );

        // Mostra mensagem de sucesso
        setMensagemSucesso(response.message || "Status atualizado com sucesso");
        setTimeout(() => setMensagemSucesso(null), 3000);
      } else {
        const error = await res.json();
        alert(error.error || "Erro ao alterar status");
      }
    } catch (error) {
      console.error("Erro ao alterar status:", error);
      alert("Erro ao alterar status");
    } finally {
      setAlterandoStatus(null);
    }
  };

  const toggleProcesso = async (processoId: number, ativo: boolean) => {
    if (!podeEditar) return;

    setAlterandoProcesso(processoId);
    try {
      const res = await fetch(`/api/intranet/monitorador/processos/${processoId}/toggle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo }),
      });

      if (res.ok) {
        const response = await res.json();

        // Atualiza localmente
        setDados(prev =>
          prev.map(rede => ({
            ...rede,
            empresas: rede.empresas.map(emp => ({
              ...emp,
              processos: emp.processos.map(proc =>
                proc.id === processoId ? { ...proc, ativo } : proc
              ),
            })),
          }))
        );

        // Mostra mensagem de sucesso
        setMensagemSucesso(response.message || "Processo atualizado com sucesso");
        setTimeout(() => setMensagemSucesso(null), 3000);
      } else {
        const error = await res.json();
        alert(error.error || "Erro ao alterar status do processo");
      }
    } catch (error) {
      console.error("Erro ao alterar status do processo:", error);
      alert("Erro ao alterar status do processo");
    } finally {
      setAlterandoProcesso(null);
    }
  };

  const iniciarEdicaoRede = (nomeRede: string) => {
    if (!podeEditar) return;
    setEditandoRede(nomeRede);
    setNovoNomeRede(nomeRede);
  };

  const cancelarEdicaoRede = () => {
    setEditandoRede(null);
    setNovoNomeRede("");
  };

  const salvarNomeRede = async (nomeRedeAntigo: string) => {
    if (!podeEditar || !novoNomeRede.trim()) return;

    setSalvandoRede(true);
    try {
      // Pega o primeiro machine_uuid dessa rede para fazer a atualização
      const rede = dados.find(r => r.nomeRede === nomeRedeAntigo);
      if (!rede || rede.empresas.length === 0) {
        alert("Nenhuma empresa encontrada nesta rede");
        return;
      }

      // Atualiza todas as máquinas dessa rede
      const promises = rede.empresas.map(empresa =>
        fetch(`/api/intranet/monitorador/rede/${empresa.machine_uuid}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome_rede: novoNomeRede.trim() }),
        })
      );

      const results = await Promise.all(promises);
      const allOk = results.every(res => res.ok);

      if (allOk) {
        // Atualiza localmente
        setDados(prev =>
          prev.map(r =>
            r.nomeRede === nomeRedeAntigo
              ? {
                  ...r,
                  nomeRede: novoNomeRede.trim(),
                  empresas: r.empresas.map(emp => ({
                    ...emp,
                    nome_rede: novoNomeRede.trim(),
                  })),
                }
              : r
          )
        );

        setMensagemSucesso("Nome da rede atualizado com sucesso");
        setTimeout(() => setMensagemSucesso(null), 3000);
        cancelarEdicaoRede();
      } else {
        alert("Erro ao atualizar nome da rede");
      }
    } catch (error) {
      console.error("Erro ao salvar nome da rede:", error);
      alert("Erro ao salvar nome da rede");
    } finally {
      setSalvandoRede(false);
    }
  };

  const dadosFiltrados = useMemo(() => {
    if (!filtro.trim()) return dados;

    const termo = filtro.toLowerCase();
    return dados
      .map(rede => ({
        ...rede,
        empresas: rede.empresas.filter(emp => {
          const textoEmpresa = `${emp.nome_fantasia} ${emp.razao_social} ${emp.cnpj}`.toLowerCase();
          const textoProcessos = emp.processos.map(p => p.process_label).join(" ").toLowerCase();
          return textoEmpresa.includes(termo) || textoProcessos.includes(termo);
        }),
      }))
      .filter(rede => rede.empresas.length > 0);
  }, [dados, filtro]);

  const estatisticas = useMemo(() => {
    let totalEmpresas = 0;
    let totalOnline = 0;
    let totalOffline = 0;
    let totalProcessos = 0;

    dados.forEach(rede => {
      rede.empresas.forEach(empresa => {
        totalEmpresas++;
        if (empresa.heartbeat?.status === "online") totalOnline++;
        else totalOffline++;
        totalProcessos += empresa.processos.length;
      });
    });

    return { totalEmpresas, totalOnline, totalOffline, totalProcessos };
  }, [dados]);

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "online":
        return "#10b981";
      case "offline":
        return "#ef4444";
      case "sem_sinal":
        return "#f59e0b";
      case "warning":
        return "#f97316";
      default:
        return "#6b7280";
    }
  };

  const formatarDataHora = (dataISO: string) => {
    if (!dataISO) return "-";

    // Garante que ambas as datas estão em UTC para comparação correta
    const data = new Date(dataISO);
    const agora = new Date();

    // Calcula diferença em UTC (independente do timezone)
    const diffMs = agora.getTime() - data.getTime();
    const diffMinutos = Math.floor(diffMs / 60000);

    if (diffMinutos < 1) return "agora mesmo";
    if (diffMinutos < 60) return `${diffMinutos} min atrás`;

    const diffHoras = Math.floor(diffMinutos / 60);
    if (diffHoras < 24) return `${diffHoras}h atrás`;

    const diffDias = Math.floor(diffHoras / 24);
    if (diffDias === 1) return "ontem";
    if (diffDias < 7) return `${diffDias} dias atrás`;

    return data.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  };

  const formatarCNPJ = (cnpj: string) => {
    if (!cnpj) return "";
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  };

  const formatarNumero = (valor: any, casasDecimais: number = 1): string => {
    const num = typeof valor === 'number' ? valor : Number(valor || 0);
    return num.toFixed(casasDecimais);
  };

  const formatarStatus = (status?: string): string => {
    const statusMap: Record<string, string> = {
      online: "Online",
      offline: "Offline",
      sem_sinal: "Sem Sinal",
      warning: "Aviso",
    };
    return statusMap[status || ""] || "Sem Dados";
  };

  // Estilos
  const s = {
    page: {
      padding: "28px 32px",
      fontFamily: "inherit",
      background: "#f9fafb",
    } as React.CSSProperties,
    header: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 24,
    } as React.CSSProperties,
    titulo: {
      fontSize: 22,
      fontWeight: 700,
      color: "#1e1b4b",
      display: "flex",
      alignItems: "center",
      gap: 8,
    } as React.CSSProperties,
    filtroContainer: {
      marginBottom: 20,
    } as React.CSSProperties,
    inputFiltro: {
      width: "100%",
      maxWidth: 400,
      border: "1px solid #d1d5db",
      borderRadius: 8,
      padding: "10px 14px",
      fontSize: 14,
      outline: "none",
    } as React.CSSProperties,
    rede: {
      background: "#fff",
      borderRadius: 12,
      border: "1px solid #e5e7eb",
      marginBottom: 16,
      overflow: "hidden",
    } as React.CSSProperties,
    redeHeader: {
      background: "#1e40af", // Azul escuro para consistência com menu
      padding: "14px 20px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 10,
      color: "#fff",
      fontWeight: 700,
      fontSize: 16,
      transition: "background 0.2s",
    } as React.CSSProperties,
    redeBody: {
      padding: "0",
    } as React.CSSProperties,
    empresa: {
      borderTop: "1px solid #f3f4f6",
    } as React.CSSProperties,
    empresaHeader: {
      padding: "12px 20px 12px 40px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      background: "#fafafa",
      transition: "background 0.2s",
    } as React.CSSProperties,
    empresaHeaderHover: {
      background: "#f3f4f6",
    } as React.CSSProperties,
    empresaInfo: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flex: 1,
    } as React.CSSProperties,
    empresaNome: {
      fontWeight: 600,
      fontSize: 14,
      color: "#111827",
    } as React.CSSProperties,
    empresaCnpj: {
      fontSize: 12,
      color: "#6b7280",
      fontFamily: "monospace",
    } as React.CSSProperties,
    statusBadge: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 12px",
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
    } as React.CSSProperties,
    empresaBody: {
      padding: "16px 20px 16px 60px",
      background: "#fff",
    } as React.CSSProperties,
    infoGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      gap: 12,
      marginBottom: 16,
      padding: 12,
      background: "#f9fafb",
      borderRadius: 8,
    } as React.CSSProperties,
    infoItem: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontSize: 13,
      color: "#374151",
    } as React.CSSProperties,
    processosList: {
      marginTop: 12,
    } as React.CSSProperties,
    processosTitle: {
      fontSize: 13,
      fontWeight: 700,
      color: "#374151",
      marginBottom: 8,
      display: "flex",
      alignItems: "center",
      gap: 6,
    } as React.CSSProperties,
    processo: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 14px",
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 8,
      marginBottom: 6,
      transition: "all 0.2s",
    } as React.CSSProperties,
    processoInativo: {
      opacity: 0.5,
      background: "#f9fafb",
    } as React.CSSProperties,
    processoNome: {
      fontWeight: 600,
      fontSize: 13,
      color: "#111827",
    } as React.CSSProperties,
    processoDetalhes: {
      fontSize: 11,
      color: "#6b7280",
      marginTop: 2,
    } as React.CSSProperties,
    emptyState: {
      textAlign: "center" as const,
      padding: 60,
      color: "#9ca3af",
    } as React.CSSProperties,
    statsContainer: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      gap: 16,
      marginBottom: 24,
    } as React.CSSProperties,
    statCard: {
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: "16px 20px",
      display: "flex",
      alignItems: "center",
      gap: 12,
    } as React.CSSProperties,
    statIcon: {
      width: 48,
      height: 48,
      borderRadius: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    } as React.CSSProperties,
    statInfo: {
      flex: 1,
    } as React.CSSProperties,
    statLabel: {
      fontSize: 12,
      color: "#6b7280",
      fontWeight: 600,
      textTransform: "uppercase" as const,
      letterSpacing: "0.5px",
    } as React.CSSProperties,
    statValue: {
      fontSize: 24,
      fontWeight: 700,
      color: "#111827",
      marginTop: 2,
    } as React.CSSProperties,
    btnAtualizar: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: "#fff",
      border: "1px solid #d1d5db",
      borderRadius: 8,
      padding: "9px 18px",
      fontSize: 14,
      fontWeight: 600,
      cursor: "pointer",
      color: "#374151",
      transition: "all 0.2s",
    } as React.CSSProperties,
    btnBloquear: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      padding: "4px 10px",
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer",
      border: "none",
      transition: "all 0.2s",
    } as React.CSSProperties,
    btnDesbloquear: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      padding: "4px 10px",
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer",
      border: "none",
      transition: "all 0.2s",
      background: "#10b981",
      color: "#fff",
    } as React.CSSProperties,
    situacaoBadge: {
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      marginLeft: 6,
    } as React.CSSProperties,
    btnToggleProcesso: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      padding: "4px 10px",
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 600,
      cursor: "pointer",
      border: "none",
      transition: "all 0.2s",
    } as React.CSSProperties,
  };

  return (
    <div style={s.page}>
      {/* Toast de Sucesso */}
      {mensagemSucesso && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 9999,
            background: "#10b981",
            color: "#fff",
            padding: "14px 20px",
            borderRadius: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 14,
            fontWeight: 600,
            animation: "slideIn 0.3s ease-out",
          }}
        >
          <CheckCircle2 size={18} />
          {mensagemSucesso}
        </div>
      )}

      {/* Cabeçalho */}
      <div style={s.header}>
        <div style={s.titulo}>
          <Activity size={24} />
          Monitorador de Rede
        </div>
        <button
          style={s.btnAtualizar}
          onClick={atualizar}
          disabled={atualizando}
        >
          <RefreshCw
            size={16}
            style={{
              transform: atualizando ? "rotate(360deg)" : "rotate(0deg)",
              transition: atualizando ? "transform 1s linear infinite" : "none",
            }}
          />
          {atualizando ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* Estatísticas */}
      <div style={s.statsContainer}>
        <div style={s.statCard}>
          <div style={{ ...s.statIcon, background: "#dbeafe" }}>
            <Server size={24} color="#1e40af" />
          </div>
          <div style={s.statInfo}>
            <div style={s.statLabel}>Total Empresas</div>
            <div style={s.statValue}>{estatisticas.totalEmpresas}</div>
          </div>
        </div>

        <div style={s.statCard}>
          <div style={{ ...s.statIcon, background: "#dcfce7" }}>
            <CheckCircle2 size={24} color="#166534" />
          </div>
          <div style={s.statInfo}>
            <div style={s.statLabel}>Online</div>
            <div style={s.statValue}>{estatisticas.totalOnline}</div>
          </div>
        </div>

        <div style={s.statCard}>
          <div style={{ ...s.statIcon, background: "#fee2e2" }}>
            <XCircle size={24} color="#991b1b" />
          </div>
          <div style={s.statInfo}>
            <div style={s.statLabel}>Offline</div>
            <div style={s.statValue}>{estatisticas.totalOffline}</div>
          </div>
        </div>

        <div style={s.statCard}>
          <div style={{ ...s.statIcon, background: "#fef3c7" }}>
            <Activity size={24} color="#92400e" />
          </div>
          <div style={s.statInfo}>
            <div style={s.statLabel}>Processos</div>
            <div style={s.statValue}>{estatisticas.totalProcessos}</div>
          </div>
        </div>
      </div>

      {/* Filtro */}
      <div style={s.filtroContainer}>
        <input
          type="text"
          placeholder="Buscar por rede, empresa, CNPJ ou processo..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          style={s.inputFiltro}
        />
      </div>

      {/* Lista de Redes */}
      {dadosFiltrados.length === 0 ? (
        <div style={s.emptyState}>
          {filtro ? "Nenhum resultado encontrado." : "Nenhuma rede monitorada."}
        </div>
      ) : (
        dadosFiltrados.map(rede => (
          <div key={rede.nomeRede} style={s.rede}>
            {/* Header da Rede */}
            <div style={s.redeHeader}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, cursor: "pointer" }}
                onClick={() => toggleRede(rede.nomeRede)}
              >
                {redesAbertas.has(rede.nomeRede) ? (
                  <ChevronDown size={18} />
                ) : (
                  <ChevronRight size={18} />
                )}
                <Network size={18} />

                {editandoRede === rede.nomeRede ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={novoNomeRede}
                      onChange={(e) => setNovoNomeRede(e.target.value)}
                      style={{
                        padding: "6px 12px",
                        border: "2px solid #fff",
                        borderRadius: 6,
                        fontSize: 14,
                        fontWeight: 700,
                        outline: "none",
                        minWidth: 200,
                      }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") salvarNomeRede(rede.nomeRede);
                        if (e.key === "Escape") cancelarEdicaoRede();
                      }}
                    />
                    <button
                      onClick={() => salvarNomeRede(rede.nomeRede)}
                      disabled={salvandoRede || !novoNomeRede.trim()}
                      style={{
                        background: "#10b981",
                        border: "none",
                        borderRadius: 6,
                        padding: "6px 10px",
                        cursor: "pointer",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        opacity: salvandoRede || !novoNomeRede.trim() ? 0.5 : 1,
                      }}
                      title="Salvar (Enter)"
                    >
                      {salvandoRede ? <RefreshCw size={14} /> : <Save size={14} />}
                    </button>
                    <button
                      onClick={cancelarEdicaoRede}
                      style={{
                        background: "#ef4444",
                        border: "none",
                        borderRadius: 6,
                        padding: "6px 10px",
                        cursor: "pointer",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                      }}
                      title="Cancelar (Esc)"
                    >
                      <XIcon size={14} />
                    </button>
                  </div>
                ) : (
                  <span>{rede.nomeRede}</span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, opacity: 0.9 }}>
                  {rede.empresas.length} {rede.empresas.length === 1 ? "empresa" : "empresas"}
                </span>

                {podeEditar && editandoRede !== rede.nomeRede && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      iniciarEdicaoRede(rede.nomeRede);
                    }}
                    style={{
                      background: "rgba(255,255,255,0.2)",
                      border: "1px solid rgba(255,255,255,0.3)",
                      borderRadius: 6,
                      padding: "5px 8px",
                      cursor: "pointer",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                    }}
                    title="Editar nome da rede"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Body da Rede */}
            {redesAbertas.has(rede.nomeRede) && (
              <div style={s.redeBody}>
                {rede.empresas.map(empresa => {
                  const status = empresa.heartbeat?.status;
                  const statusColor = getStatusColor(status);
                  const isOnline = status === "online";
                  const isSemSinal = status === "sem_sinal";
                  const hasHeartbeat = !!empresa.heartbeat;

                  return (
                    <div key={empresa.cnpj} style={s.empresa}>
                      {/* Header da Empresa */}
                      <div
                        style={s.empresaHeader}
                        onClick={() => toggleEmpresa(empresa.cnpj)}
                      >
                        <div style={s.empresaInfo}>
                          {empresasAbertas.has(empresa.cnpj) ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                          <Server size={16} color={statusColor} />
                          <div>
                            <div style={s.empresaNome}>
                              {empresa.nome_fantasia || empresa.razao_social}
                            </div>
                            <div style={s.empresaCnpj}>
                              {formatarCNPJ(empresa.cnpj)}
                              {empresa.machine_ip && ` • ${empresa.machine_ip}`}
                              {empresa.situacao_cadastral && (
                                <span
                                  style={{
                                    ...s.situacaoBadge,
                                    background: empresa.situacao_cadastral === "ativo" || empresa.situacao_cadastral === "Ativa" ? "#dcfce7" : "#fee2e2",
                                    color: empresa.situacao_cadastral === "ativo" || empresa.situacao_cadastral === "Ativa" ? "#166534" : "#991b1b",
                                  }}
                                >
                                  {empresa.situacao_cadastral}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div
                            style={{
                              ...s.statusBadge,
                              background: isOnline
                                ? "#dcfce7"
                                : isSemSinal
                                ? "#fef3c7"
                                : hasHeartbeat
                                ? "#fee2e2"
                                : "#f3f4f6",
                              color: isOnline
                                ? "#166534"
                                : isSemSinal
                                ? "#92400e"
                                : hasHeartbeat
                                ? "#991b1b"
                                : "#6b7280",
                            }}
                          >
                            {isOnline ? (
                              <CheckCircle2 size={14} />
                            ) : isSemSinal ? (
                              <AlertCircle size={14} />
                            ) : hasHeartbeat ? (
                              <XCircle size={14} />
                            ) : (
                              <Clock size={14} />
                            )}
                            {formatarStatus(status)}
                          </div>

                          {podeEditar && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const estaAtivo = empresa.situacao_cadastral === "ativo" || empresa.situacao_cadastral === "Ativa";
                                alterarStatus(empresa.machine_uuid, estaAtivo ? "bloqueado" : "ativo");
                              }}
                              disabled={alterandoStatus === empresa.machine_uuid}
                              style={{
                                ...(empresa.situacao_cadastral === "ativo" || empresa.situacao_cadastral === "Ativa" ? {
                                  ...s.btnBloquear,
                                  background: "#ef4444",
                                  color: "#fff",
                                } : s.btnDesbloquear),
                                opacity: alterandoStatus === empresa.machine_uuid ? 0.5 : 1,
                              }}
                              title={empresa.situacao_cadastral === "ativo" || empresa.situacao_cadastral === "Ativa" ? "Bloquear" : "Ativar"}
                            >
                              {alterandoStatus === empresa.machine_uuid ? (
                                <RefreshCw size={12} />
                              ) : empresa.situacao_cadastral === "ativo" || empresa.situacao_cadastral === "Ativa" ? (
                                <Lock size={12} />
                              ) : (
                                <Unlock size={12} />
                              )}
                              {alterandoStatus === empresa.machine_uuid
                                ? "..."
                                : empresa.situacao_cadastral === "ativo" || empresa.situacao_cadastral === "Ativa"
                                ? "Bloquear"
                                : "Ativar"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Body da Empresa */}
                      {empresasAbertas.has(empresa.cnpj) && (
                        <div style={s.empresaBody}>
                          {/* Alerta de sem sinal */}
                          {isSemSinal && empresa.heartbeat?.ultimo_contato && (
                            <div
                              style={{
                                background: "#fef3c7",
                                border: "1px solid #fbbf24",
                                borderRadius: 8,
                                padding: "12px 16px",
                                marginBottom: 16,
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                color: "#92400e",
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              <AlertCircle size={18} />
                              <div>
                                ⚠️ Sem comunicação desde {formatarDataHora(empresa.heartbeat.ultimo_contato)}
                              </div>
                            </div>
                          )}

                          {/* Informações de Sistema */}
                          {empresa.heartbeat && (
                            <div style={s.infoGrid}>
                              <div style={s.infoItem}>
                                <Cpu size={14} color="#6366f1" />
                                CPU: {formatarNumero(empresa.heartbeat.cpu_percent)}%
                              </div>
                              <div style={s.infoItem}>
                                <MemoryStick size={14} color="#8b5cf6" />
                                RAM: {formatarNumero(empresa.heartbeat.mem_percent)}%
                              </div>
                              <div style={s.infoItem}>
                                <PlayCircle size={14} color="#10b981" />
                                Rodando: {formatarNumero(empresa.heartbeat.proc_rodando, 0)}
                              </div>
                              <div style={s.infoItem}>
                                <XCircle size={14} color="#ef4444" />
                                Parado: {formatarNumero(empresa.heartbeat.proc_parado, 0)}
                              </div>
                              <div style={s.infoItem}>
                                <Clock size={14} color="#f59e0b" />
                                Último contato: {formatarDataHora(empresa.heartbeat.ultimo_contato)}
                              </div>
                            </div>
                          )}

                          {/* Lista de Processos */}
                          {empresa.processos.length > 0 && (
                            <div style={s.processosList}>
                              <div style={s.processosTitle}>
                                <Activity size={14} />
                                Processos Monitorados ({empresa.processos.length})
                              </div>
                              {empresa.processos.map(proc => (
                                <div
                                  key={proc.id}
                                  style={{
                                    ...s.processo,
                                    ...(proc.ativo ? {} : s.processoInativo),
                                  }}
                                >
                                  <div style={{ flex: 1 }}>
                                    <div style={s.processoNome}>
                                      {proc.process_label || proc.process_name}
                                      {!proc.ativo && (
                                        <span
                                          style={{
                                            marginLeft: 8,
                                            padding: "2px 8px",
                                            borderRadius: 4,
                                            fontSize: 10,
                                            fontWeight: 600,
                                            background: "#fee2e2",
                                            color: "#991b1b",
                                          }}
                                        >
                                          Desativado
                                        </span>
                                      )}
                                    </div>
                                    <div style={s.processoDetalhes}>
                                      {proc.process_name} • {proc.watch_type}
                                      {proc.auto_restart && " • Auto-restart"}
                                      {proc.log_enabled && " • Log ativado"}
                                    </div>
                                  </div>

                                  {podeEditar && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleProcesso(proc.id, !proc.ativo);
                                      }}
                                      disabled={alterandoProcesso === proc.id}
                                      style={{
                                        ...s.btnToggleProcesso,
                                        background: proc.ativo ? "#ef4444" : "#10b981",
                                        color: "#fff",
                                        opacity: alterandoProcesso === proc.id ? 0.5 : 1,
                                      }}
                                      title={proc.ativo ? "Desativar processo" : "Ativar processo"}
                                    >
                                      {alterandoProcesso === proc.id ? (
                                        <RefreshCw size={11} />
                                      ) : proc.ativo ? (
                                        <XCircle size={11} />
                                      ) : (
                                        <CheckCircle2 size={11} />
                                      )}
                                      {alterandoProcesso === proc.id
                                        ? "..."
                                        : proc.ativo
                                        ? "Desativar"
                                        : "Ativar"}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {empresa.processos.length === 0 && (
                            <div style={{ ...s.emptyState, padding: 20 }}>
                              Nenhum processo monitorado
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
