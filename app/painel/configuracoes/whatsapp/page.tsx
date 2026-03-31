"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Smartphone,
  Plus,
  Trash2,
  RefreshCw,
  QrCode,
  CheckCircle2,
  XCircle,
  Loader2,
  Wifi,
  WifiOff,
  Copy,
  Check,
  MessageSquare,
  Clock,
  Bot,
  Key,
  Eye,
  EyeOff,
  Users,
  ToggleLeft,
  ToggleRight,
  Search,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Instancia {
  id: string;
  nome_instancia: string;
  numero: string | null;
  provider: string;
  status: string;
  ativo: boolean;
}

interface WhatsappConfig {
  horario_bot_inicio: string;
  horario_bot_fim: string;
  msg_boas_vindas: string;
  msg_fora_horario: string;
  msg_ticket_criado: string;
  msg_ticket_respondido: string;
  criar_ticket_auto: boolean;
  ia_ativa: boolean;
  ia_modo: string;
  alerta_grupos_ativo: boolean;
  alerta_grupos_min: number;
  alerta_grupos_jid: string;
  alerta_grupos_usar_ia: boolean;
  alerta_grupos_instancia: string;
}

type Tab = "instancias" | "configuracoes" | "api";

export default function WhatsappConfigPage() {
  const [tab, setTab] = useState<Tab>("instancias");
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [loadingInstancias, setLoadingInstancias] = useState(true);
  const [novaInstancia, setNovaInstancia] = useState("");
  const [criando, setCriando] = useState(false);
  const [qrCodeAberto, setQrCodeAberto] = useState<{
    id: string;
    nome: string;
    qr: string | null;
  } | null>(null);
  const [conectando, setConectando] = useState<string | null>(null);
  const [checandoStatus, setChecandoStatus] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const qrPollRef = useRef<NodeJS.Timeout | null>(null);

  // Grupos
  interface GrupoDebug {
    jid: string;
    nome: string;
    descricao: string | null;
    membros: number;
    foto: string | null;
    monitorado?: boolean;
    grupo_id?: string;
  }
  const [gruposModal, setGruposModal] = useState<{
    instancia: Instancia;
    grupos: GrupoDebug[];
  } | null>(null);
  const [carregandoGrupos, setCarregandoGrupos] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [toggleMonitor, setToggleMonitor] = useState<string | null>(null);
  const [buscaGrupo, setBuscaGrupo] = useState("");
  const [removendoGrupo, setRemovendoGrupo] = useState<string | null>(null);

  // Config state
  const [config, setConfig] = useState<WhatsappConfig>({
    horario_bot_inicio: "08:00",
    horario_bot_fim: "18:00",
    msg_boas_vindas: "Olá! Seja bem-vindo ao suporte. Como posso ajudar?",
    msg_fora_horario:
      "Nosso atendimento funciona de segunda a sexta, das 8h às 18h. Retornaremos em breve.",
    msg_ticket_criado: "Ticket *#{{numero}}* criado! Acompanhe pelo portal.",
    msg_ticket_respondido: "Seu ticket *#{{numero}}* recebeu uma resposta.",
    criar_ticket_auto: true,
    ia_ativa: false,
    ia_modo: "sugestao",
    alerta_grupos_ativo: false,
    alerta_grupos_min: 30,
    alerta_grupos_jid: "",
    alerta_grupos_usar_ia: true,
    alerta_grupos_instancia: "",
  });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // API config state
  const [apiConfig, setApiConfig] = useState({
    evolution_api_url: "",
    evolution_api_key: "",
    evolution_instance: "",
  });
  const [apiKeySet, setApiKeySet] = useState(false);
  const [mostrarToken, setMostrarToken] = useState(false);
  const [loadingApi, setLoadingApi] = useState(true);
  const [salvandoApi, setSalvandoApi] = useState(false);
  const [testandoApi, setTestandoApi] = useState(false);

  const carregarInstancias = useCallback(async () => {
    const res = await fetch("/api/whatsapp/instancias");
    if (res.ok) setInstancias(await res.json());
    setLoadingInstancias(false);
  }, []);

  const carregarConfig = useCallback(async () => {
    const res = await fetch("/api/whatsapp/config");
    if (res.ok) {
      const data = await res.json();
      if (data && Object.keys(data).length > 0) {
        setConfig((prev) => ({ ...prev, ...data }));
      }
    }
    setLoadingConfig(false);
  }, []);

  const carregarApiConfig = useCallback(async () => {
    const res = await fetch("/api/whatsapp/api-config");
    if (res.ok) {
      const data = await res.json();
      setApiConfig({
        evolution_api_url: data.evolution_api_url ?? "",
        evolution_api_key: data.evolution_api_key ?? "",
        evolution_instance: data.evolution_instance ?? "",
      });
      setApiKeySet(data.evolution_api_key_set ?? false);
    }
    setLoadingApi(false);
  }, []);

  useEffect(() => {
    carregarInstancias();
    carregarConfig();
    carregarApiConfig();
  }, [carregarInstancias, carregarConfig, carregarApiConfig]);

  // Poll QR code status while modal is open
  useEffect(() => {
    if (!qrCodeAberto) {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
      return;
    }
    const poll = async () => {
      const res = await fetch(`/api/whatsapp/instancias/${qrCodeAberto.id}/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "conectado") {
          setQrCodeAberto(null);
          await carregarInstancias();
          toast.success("WhatsApp conectado com sucesso!");
        }
      }
    };
    qrPollRef.current = setInterval(poll, 4000);
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
    };
  }, [qrCodeAberto, carregarInstancias]);

  async function criarInstancia() {
    if (!novaInstancia.trim()) return;
    setCriando(true);
    try {
      const res = await fetch("/api/whatsapp/instancias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome_instancia: novaInstancia.trim() }),
      });
      if (res.ok) {
        setNovaInstancia("");
        await carregarInstancias();
        toast.success("Instância criada. Agora conecte via QR Code.");
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Erro ao criar instância");
      }
    } finally {
      setCriando(false);
    }
  }

  async function conectar(instancia: Instancia) {
    setConectando(instancia.id);
    try {
      const res = await fetch(`/api/whatsapp/instancias/${instancia.id}/connect`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setQrCodeAberto({
          id: instancia.id,
          nome: instancia.nome_instancia,
          qr: data.qr_code,
        });
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Erro ao obter QR Code");
      }
    } finally {
      setConectando(null);
    }
  }

  async function checarStatus(instancia: Instancia) {
    setChecandoStatus(instancia.id);
    try {
      const res = await fetch(`/api/whatsapp/instancias/${instancia.id}/status`);
      if (res.ok) {
        const data = await res.json();
        setInstancias((prev) =>
          prev.map((i) =>
            i.id === instancia.id
              ? { ...i, status: data.status, numero: data.numero ?? i.numero }
              : i
          )
        );
        toast.info(`Status: ${labelStatus(data.status)}`);
      }
    } finally {
      setChecandoStatus(null);
    }
  }

  async function excluir(instancia: Instancia) {
    if (!confirm(`Excluir instância "${instancia.nome_instancia}"? Essa ação desconectará o WhatsApp.`))
      return;
    setExcluindo(instancia.id);
    try {
      const res = await fetch(`/api/whatsapp/instancias/${instancia.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await carregarInstancias();
        toast.success("Instância excluída");
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Erro ao excluir");
      }
    } finally {
      setExcluindo(null);
    }
  }

  async function abrirGrupos(instancia: Instancia) {
    setCarregandoGrupos(instancia.id);
    try {
      // Busca grupos já sincronizados no banco
      const res = await fetch("/api/whatsapp/grupos");
      const grupos: GrupoDebug[] = [];
      if (res.ok) {
        const salvos = await res.json() as Array<{
          id: string; instancia_id: string; group_jid: string;
          nome: string; descricao: string | null; total_membros: number;
          foto_url: string | null; monitorado: boolean;
        }>;
        salvos
          .filter((g) => g.instancia_id === instancia.id)
          .forEach((g) => grupos.push({
            jid: g.group_jid, nome: g.nome, descricao: g.descricao,
            membros: g.total_membros, foto: g.foto_url,
            monitorado: g.monitorado, grupo_id: g.id,
          }));
      }
      setGruposModal({ instancia, grupos });
    } finally {
      setCarregandoGrupos(null);
    }
  }

  async function sincronizarGrupos() {
    if (!gruposModal) return;
    setSincronizando(true);
    try {
      const res = await fetch("/api/whatsapp/grupos/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instancia_id: gruposModal.instancia.id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Sincronizado: ${data.total} grupos (${data.inseridos} novos)`);
        await abrirGrupos(gruposModal.instancia);
        setGruposModal((prev) => prev ? { ...prev } : null);
      } else {
        toast.error(data.error ?? "Erro ao sincronizar");
      }
    } finally {
      setSincronizando(false);
    }
  }

  async function toggleMonitoramento(grupo: GrupoDebug) {
    if (!grupo.grupo_id) return;
    setToggleMonitor(grupo.grupo_id);
    try {
      const res = await fetch(`/api/whatsapp/grupos/${grupo.grupo_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitorado: !grupo.monitorado }),
      });
      if (res.ok) {
        setGruposModal((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            grupos: prev.grupos.map((g) =>
              g.grupo_id === grupo.grupo_id ? { ...g, monitorado: !g.monitorado } : g
            ),
          };
        });
      } else {
        toast.error("Erro ao atualizar monitoramento");
      }
    } finally {
      setToggleMonitor(null);
    }
  }

  async function removerGrupo(grupo: GrupoDebug, sair: boolean) {
    if (!grupo.grupo_id) return;
    const msg = sair
      ? `Sair do grupo "${grupo.nome}" no WhatsApp e remover do sistema?`
      : `Remover o grupo "${grupo.nome}" do sistema? O bot continua no grupo do WhatsApp.`;
    if (!confirm(msg)) return;

    setRemovendoGrupo(grupo.grupo_id + (sair ? "_sair" : "_apagar"));
    try {
      const res = await fetch(
        `/api/whatsapp/grupos/${grupo.grupo_id}?sair=${sair}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setGruposModal((prev) =>
          prev ? { ...prev, grupos: prev.grupos.filter((g) => g.grupo_id !== grupo.grupo_id) } : null
        );
        toast.success(sair ? "Bot saiu do grupo e dados removidos" : "Dados do grupo removidos");
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Erro ao remover grupo");
      }
    } finally {
      setRemovendoGrupo(null);
    }
  }

  async function salvarConfig() {
    setSalvandoConfig(true);
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("Configurações salvas");
      } else {
        toast.error("Erro ao salvar configurações");
      }
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function salvarApiConfig() {
    setSalvandoApi(true);
    try {
      const res = await fetch("/api/whatsapp/api-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiConfig),
      });
      if (res.ok) {
        toast.success("Configurações da API salvas");
        await carregarApiConfig();
      } else {
        toast.error("Erro ao salvar configurações da API");
      }
    } finally {
      setSalvandoApi(false);
    }
  }

  async function testarConexaoApi() {
    if (!apiConfig.evolution_api_url) {
      toast.error("Informe a URL da API");
      return;
    }
    setTestandoApi(true);
    try {
      // Primeiro salva, depois testa criando uma instância temporária
      await salvarApiConfig();
      // Testa buscando instâncias existentes
      const res = await fetch("/api/whatsapp/instancias");
      if (res.ok) {
        toast.success("Conexão com a API testada com sucesso!");
      } else {
        toast.error("Falha ao conectar com a API. Verifique URL e Token.");
      }
    } catch {
      toast.error("Erro ao testar conexão");
    } finally {
      setTestandoApi(false);
    }
  }

  function copiarWebhookUrl() {
    const url = `${window.location.origin}/api/whatsapp/webhook`;
    navigator.clipboard.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function labelStatus(status: string) {
    const map: Record<string, string> = {
      conectado: "Conectado",
      desconectado: "Desconectado",
      conectando: "Conectando...",
      aguardando_qr: "Aguardando QR Code",
    };
    return map[status] ?? status;
  }

  function iconStatus(status: string) {
    if (status === "conectado")
      return <Wifi className="h-4 w-4 text-green-500" />;
    if (status === "conectando" || status === "aguardando_qr")
      return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
    return <WifiOff className="h-4 w-4 text-zinc-400" />;
  }

  function corStatus(status: string) {
    if (status === "conectado") return "text-green-600 bg-green-50 border-green-200";
    if (status === "conectando" || status === "aguardando_qr")
      return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-zinc-500 bg-zinc-50 border-zinc-200";
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 flex items-center gap-2">
          <Smartphone className="h-6 w-6 text-green-600" />
          WhatsApp
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Gerencie instâncias e configure o comportamento do bot
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200">
        {(
          [
            { id: "instancias", label: "Instâncias", icon: Smartphone },
            { id: "configuracoes", label: "Configurações do Bot", icon: Bot },
            { id: "api", label: "API", icon: Key },
          ] as { id: Tab; label: string; icon: React.ElementType }[]
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-green-600 text-green-700"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* INSTÂNCIAS */}
      {tab === "instancias" && (
        <div className="space-y-6">
          {/* Webhook URL */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-zinc-700">URL do Webhook</p>
              <button
                onClick={copiarWebhookUrl}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
              >
                {copiado ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-600" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </>
                )}
              </button>
            </div>
            <code className="text-xs text-zinc-600 break-all">
              {typeof window !== "undefined" ? window.location.origin : ""}/api/whatsapp/webhook
            </code>
            <p className="text-xs text-zinc-400 mt-1">
              Configure essa URL no Evolution API para receber mensagens
            </p>
          </div>

          {/* Nova instância */}
          <div className="bg-white border border-zinc-200 rounded-lg p-4">
            <h2 className="text-sm font-medium text-zinc-800 mb-3 flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Nova Instância
            </h2>
            <div className="flex gap-2">
              <Input
                placeholder="Nome da instância (ex: digitalrf-principal)"
                value={novaInstancia}
                onChange={(e) => setNovaInstancia(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && criarInstancia()}
                className="flex-1"
              />
              <Button onClick={criarInstancia} disabled={criando || !novaInstancia.trim()}>
                {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
              </Button>
            </div>
          </div>

          {/* Lista de instâncias */}
          <div className="space-y-3">
            {loadingInstancias ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              </div>
            ) : instancias.length === 0 ? (
              <div className="text-center py-12 bg-zinc-50 border border-dashed border-zinc-200 rounded-lg">
                <Smartphone className="h-8 w-8 mx-auto mb-2 text-zinc-300" />
                <p className="text-sm text-zinc-500">Nenhuma instância criada ainda</p>
              </div>
            ) : (
              instancias.map((inst) => (
                <div
                  key={inst.id}
                  className="bg-white border border-zinc-200 rounded-lg p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {iconStatus(inst.status)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">
                        {inst.nome_instancia}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`inline-flex items-center text-xs px-2 py-0.5 rounded border ${corStatus(inst.status)}`}
                        >
                          {labelStatus(inst.status)}
                        </span>
                        {inst.numero && (
                          <span className="text-xs text-zinc-400">+{inst.numero}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {inst.status !== "conectado" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => conectar(inst)}
                        disabled={conectando === inst.id}
                        className="gap-1.5"
                      >
                        {conectando === inst.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <QrCode className="h-3.5 w-3.5" />
                        )}
                        Conectar
                      </Button>
                    )}
                    {inst.status === "conectado" && (
                      <>
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Ativo
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => abrirGrupos(inst)}
                          disabled={carregandoGrupos === inst.id}
                          className="gap-1.5 text-xs"
                          title="Ver grupos"
                        >
                          {carregandoGrupos === inst.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Users className="h-3.5 w-3.5" />
                          )}
                          Grupos
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => checarStatus(inst)}
                      disabled={checandoStatus === inst.id}
                      title="Verificar status"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${checandoStatus === inst.id ? "animate-spin" : ""}`}
                      />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => excluir(inst)}
                      disabled={excluindo === inst.id}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      {excluindo === inst.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* CONFIGURAÇÕES */}
      {tab === "configuracoes" && (
        <div className="space-y-6">
          {loadingConfig ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              {/* Horário */}
              <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-4">
                <h2 className="text-sm font-medium text-zinc-800 flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> Horário de Atendimento
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="inicio" className="text-xs">
                      Início
                    </Label>
                    <Input
                      id="inicio"
                      type="time"
                      value={config.horario_bot_inicio}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, horario_bot_inicio: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="fim" className="text-xs">
                      Fim
                    </Label>
                    <Input
                      id="fim"
                      type="time"
                      value={config.horario_bot_fim}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, horario_bot_fim: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Mensagens automáticas */}
              <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-4">
                <h2 className="text-sm font-medium text-zinc-800 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4" /> Mensagens Automáticas
                </h2>
                <p className="text-xs text-zinc-400">
                  Use <code className="bg-zinc-100 px-1 rounded">{"{{numero}}"}</code> para inserir o número do ticket
                </p>

                <div>
                  <Label className="text-xs">Boas-vindas</Label>
                  <Textarea
                    rows={2}
                    value={config.msg_boas_vindas}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, msg_boas_vindas: e.target.value }))
                    }
                    placeholder="Mensagem enviada ao primeiro contato"
                  />
                </div>

                <div>
                  <Label className="text-xs">Fora do horário</Label>
                  <Textarea
                    rows={2}
                    value={config.msg_fora_horario}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, msg_fora_horario: e.target.value }))
                    }
                    placeholder="Mensagem enviada fora do horário de atendimento"
                  />
                </div>

                <div>
                  <Label className="text-xs">Ticket criado</Label>
                  <Textarea
                    rows={2}
                    value={config.msg_ticket_criado}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, msg_ticket_criado: e.target.value }))
                    }
                    placeholder="Mensagem enviada quando um ticket é criado"
                  />
                </div>

                <div>
                  <Label className="text-xs">Ticket respondido</Label>
                  <Textarea
                    rows={2}
                    value={config.msg_ticket_respondido}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, msg_ticket_respondido: e.target.value }))
                    }
                    placeholder="Mensagem enviada quando um ticket recebe resposta"
                  />
                </div>
              </div>

              {/* Bot & IA */}
              <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-4">
                <h2 className="text-sm font-medium text-zinc-800 flex items-center gap-1.5">
                  <Bot className="h-4 w-4" /> Automação
                </h2>

                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={config.criar_ticket_auto}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, criar_ticket_auto: e.target.checked }))
                      }
                    />
                    <div className="w-10 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-800">
                      Criar ticket automaticamente
                    </p>
                    <p className="text-xs text-zinc-400">
                      Cada nova conversa gera um ticket no sistema
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={config.ia_ativa}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, ia_ativa: e.target.checked }))
                      }
                    />
                    <div className="w-10 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-800">Ativar IA</p>
                    <p className="text-xs text-zinc-400">
                      Usa Claude para sugerir ou enviar respostas automáticas
                    </p>
                  </div>
                </label>

                {config.ia_ativa && (
                  <div>
                    <Label className="text-xs">Modo da IA</Label>
                    <select
                      value={config.ia_modo}
                      onChange={(e) => setConfig((c) => ({ ...c, ia_modo: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 text-sm border border-zinc-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-green-500"
                    >
                      <option value="sugestao">Sugestão (atendente aprova)</option>
                      <option value="autonomo">Autônomo (responde sozinho)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* MONITORAMENTO DE GRUPOS */}
              <div className="border-t border-zinc-100 pt-4 space-y-3">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Monitoramento de grupos
                </p>

                <label className="flex items-center gap-3 cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={config.alerta_grupos_ativo}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, alerta_grupos_ativo: e.target.checked }))
                      }
                    />
                    <div className="w-10 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-800">Ativar alertas de grupos sem resposta</p>
                    <p className="text-xs text-zinc-400">
                      Envia mensagem no grupo de suporte quando um cliente aguarda além do tempo configurado
                    </p>
                  </div>
                </label>

                {config.alerta_grupos_ativo && (
                  <div className="space-y-3 pl-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Tempo sem resposta (minutos)</Label>
                        <Input
                          type="number"
                          min={5}
                          max={1440}
                          value={config.alerta_grupos_min}
                          onChange={(e) =>
                            setConfig((c) => ({ ...c, alerta_grupos_min: Number(e.target.value) }))
                          }
                          className="mt-1 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Instância para envio do alerta</Label>
                        <select
                          value={config.alerta_grupos_instancia}
                          onChange={(e) =>
                            setConfig((c) => ({ ...c, alerta_grupos_instancia: e.target.value }))
                          }
                          className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
                        >
                          <option value="">Usar instância padrão</option>
                          {instancias.map((inst) => (
                            <option key={inst.id} value={inst.nome_instancia}>
                              {inst.nome_instancia}{inst.numero ? ` (${inst.numero})` : ""}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-zinc-400 mt-1">
                          O número selecionado precisa estar no grupo de suporte.
                        </p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">JID do grupo de suporte</Label>
                      <Input
                        type="text"
                        placeholder="120363xxxxx@g.us"
                        value={config.alerta_grupos_jid}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, alerta_grupos_jid: e.target.value }))
                        }
                        className="mt-1 text-sm font-mono"
                      />
                      <p className="text-xs text-zinc-400 mt-1">
                        Grupo WhatsApp que receberá os alertas. Encontre o JID na lista de grupos monitorados.
                      </p>
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className="relative">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={config.alerta_grupos_usar_ia}
                          onChange={(e) =>
                            setConfig((c) => ({ ...c, alerta_grupos_usar_ia: e.target.checked }))
                          }
                        />
                        <div className="w-10 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-800">Verificar resolução com IA antes de alertar</p>
                        <p className="text-xs text-zinc-400">
                          A IA analisa as mensagens do grupo para verificar se o cliente já resolveu o problema sozinho antes de enviar o alerta
                        </p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={salvarConfig}
                  disabled={salvandoConfig}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {salvandoConfig ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Salvar configurações
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ABA API */}
      {tab === "api" && (
        <div className="space-y-6">
          {loadingApi ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <strong>Atenção:</strong> O token da API é armazenado de forma segura no banco de dados.
                Ao salvar, o token atual será substituído. Deixe o campo em branco para manter o token existente.
              </div>

              <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-4">
                <h2 className="text-sm font-medium text-zinc-800 flex items-center gap-1.5">
                  <Key className="h-4 w-4" /> Evolution API
                </h2>

                <div>
                  <Label htmlFor="api-url" className="text-xs">
                    URL da API <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="api-url"
                    type="url"
                    placeholder="https://evolution.seudominio.com.br"
                    value={apiConfig.evolution_api_url}
                    onChange={(e) =>
                      setApiConfig((c) => ({ ...c, evolution_api_url: e.target.value }))
                    }
                    className="mt-1"
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    URL base do seu servidor Evolution API (sem barra no final)
                  </p>
                </div>

                <div>
                  <Label htmlFor="api-key" className="text-xs">
                    Token (API Key) {apiKeySet && <span className="text-green-600 ml-1">✓ configurado</span>}
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      id="api-key"
                      type={mostrarToken ? "text" : "password"}
                      placeholder={apiKeySet ? "Deixe em branco para manter o atual" : "Cole seu token aqui"}
                      value={apiConfig.evolution_api_key}
                      onChange={(e) =>
                        setApiConfig((c) => ({ ...c, evolution_api_key: e.target.value }))
                      }
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarToken(!mostrarToken)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {mostrarToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Encontrado em: Evolution API → Configurações → API Key Global
                  </p>
                </div>

                <div>
                  <Label htmlFor="api-instance" className="text-xs">
                    Instância padrão
                  </Label>
                  <Input
                    id="api-instance"
                    placeholder="digitalrf-principal"
                    value={apiConfig.evolution_instance}
                    onChange={(e) =>
                      setApiConfig((c) => ({ ...c, evolution_instance: e.target.value }))
                    }
                    className="mt-1"
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    Nome da instância padrão usada para envio (opcional, se tiver apenas uma)
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={testarConexaoApi}
                  disabled={testandoApi || !apiConfig.evolution_api_url}
                  className="text-sm text-zinc-600 border border-zinc-200 rounded-md px-4 py-2 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {testandoApi ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Testar conexão
                </button>

                <Button
                  onClick={salvarApiConfig}
                  disabled={salvandoApi}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {salvandoApi ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Salvar
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal de Grupos */}
      {gruposModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { setGruposModal(null); setBuscaGrupo(""); }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-100">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-green-600" />
                  Grupos — {gruposModal.instancia.nome_instancia}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {gruposModal.grupos.length} grupos sincronizados
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={sincronizarGrupos}
                  disabled={sincronizando}
                  className="gap-1.5 text-xs"
                >
                  {sincronizando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Sincronizar
                </Button>
                <button
                  onClick={() => { setGruposModal(null); setBuscaGrupo(""); }}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Busca */}
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Pesquisar grupo..."
                  value={buscaGrupo}
                  onChange={(e) => setBuscaGrupo(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-green-500 bg-zinc-50"
                />
              </div>
            </div>

            {/* Lista */}
            <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-2">
              {gruposModal.grupos.length === 0 ? (
                <div className="text-center py-10">
                  <Users className="h-8 w-8 mx-auto text-zinc-200 mb-2" />
                  <p className="text-sm text-zinc-400">Nenhum grupo sincronizado.</p>
                  <p className="text-xs text-zinc-300 mt-1">Clique em &quot;Sincronizar&quot; para importar os grupos da instância.</p>
                </div>
              ) : (() => {
                const filtrados = gruposModal.grupos.filter((g) =>
                  g.nome.toLowerCase().includes(buscaGrupo.toLowerCase())
                );
                if (filtrados.length === 0) return (
                  <div className="text-center py-8">
                    <p className="text-sm text-zinc-400">Nenhum grupo encontrado para &quot;{buscaGrupo}&quot;</p>
                  </div>
                );
                return filtrados.map((g) => (
                  <div
                    key={g.jid}
                    className="flex items-center gap-3 p-3 border border-zinc-100 rounded-lg hover:bg-zinc-50"
                  >
                    {/* Avatar */}
                    {g.foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.foto} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4 text-green-600" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-800 truncate">{g.nome}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <p className="text-xs text-zinc-400">{g.membros} membros</p>
                        <span className="text-zinc-200">·</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(g.jid);
                            toast.success("JID copiado!");
                          }}
                          className="text-xs text-zinc-400 hover:text-green-600 font-mono truncate max-w-[140px] transition-colors"
                          title="Clique para copiar o JID"
                        >
                          {g.jid}
                        </button>
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Toggle monitoramento */}
                      <button
                        onClick={() => toggleMonitoramento(g)}
                        disabled={!g.grupo_id || toggleMonitor === g.grupo_id}
                        title={g.monitorado ? "Desativar recebimento de mensagens" : "Ativar recebimento de mensagens"}
                        className="p-1.5 rounded-md hover:bg-zinc-100 disabled:opacity-40 transition-colors"
                      >
                        {toggleMonitor === g.grupo_id ? (
                          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                        ) : g.monitorado ? (
                          <ToggleRight className="h-6 w-6 text-green-500" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-zinc-300" />
                        )}
                      </button>

                      {g.grupo_id && (
                        <>
                          {/* Sair do grupo no WhatsApp e remover */}
                          <button
                            onClick={() => removerGrupo(g, true)}
                            disabled={!!removendoGrupo && removendoGrupo.startsWith(g.grupo_id!)}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-orange-200 text-orange-600 hover:bg-orange-50 disabled:opacity-40 transition-colors"
                            title="Sair do grupo no WhatsApp e remover do sistema"
                          >
                            {removendoGrupo === g.grupo_id + "_sair" ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <LogOut className="h-3 w-3" />
                            )}
                            Sair
                          </button>

                          {/* Remover somente do sistema */}
                          <button
                            onClick={() => removerGrupo(g, false)}
                            disabled={!!removendoGrupo && removendoGrupo.startsWith(g.grupo_id!)}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                            title="Remover do sistema (bot continua no grupo)"
                          >
                            {removendoGrupo === g.grupo_id + "_apagar" ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            Apagar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-zinc-100 flex items-center gap-4 text-xs text-zinc-400">
              <span className="flex items-center gap-1"><ToggleRight className="h-3.5 w-3.5 text-green-500" /> Monitorar</span>
              <span className="flex items-center gap-1 text-orange-400"><LogOut className="h-3 w-3" /> Sair do WA + apagar</span>
              <span className="flex items-center gap-1 text-red-400"><Trash2 className="h-3 w-3" /> Só apagar dados</span>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrCodeAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setQrCodeAberto(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-zinc-900">
                Conectar — {qrCodeAberto.nome}
              </h2>
              <button
                onClick={() => setQrCodeAberto(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {qrCodeAberto.qr ? (
              <>
                <div className="flex justify-center mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCodeAberto.qr}
                    alt="QR Code WhatsApp"
                    className="w-56 h-56 border border-zinc-200 rounded-lg"
                  />
                </div>
                <ol className="text-xs text-zinc-500 space-y-1 list-decimal list-inside">
                  <li>Abra o WhatsApp no celular</li>
                  <li>Vá em <strong>Dispositivos vinculados</strong></li>
                  <li>Toque em <strong>Vincular um dispositivo</strong></li>
                  <li>Aponte a câmera para o QR Code acima</li>
                </ol>
                <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Aguardando conexão...
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
                <p className="text-sm text-zinc-500">Carregando QR Code...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
