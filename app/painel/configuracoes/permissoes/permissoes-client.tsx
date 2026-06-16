"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Check,
  X,
  Lock,
  Eye,
  Edit,
  Shield,
  Loader2,
  LayoutDashboard,
  Ticket,
  Users,
  MessageSquare,
  BarChart3,
  Settings,
  FileText,
  Globe,
  Activity
} from "lucide-react";

type Perfil = "admin" | "supervisor" | "operador" | "somente_leitura";

interface PermissaoPerfil {
  pode_acessar: boolean;
  pode_editar: boolean;
}

interface Tela {
  rota: string;
  nome: string;
  perfis: Record<Perfil, PermissaoPerfil>;
}

const PERFIS: Perfil[] = ["admin", "supervisor", "operador", "somente_leitura"];

const PERFIL_LABELS: Record<Perfil, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  operador: "Operador",
  somente_leitura: "Somente Leitura"
};

const PERFIL_CORES: Record<Perfil, string> = {
  admin: "bg-red-100 text-red-700 border-red-200",
  supervisor: "bg-purple-100 text-purple-700 border-purple-200",
  operador: "bg-blue-100 text-blue-700 border-blue-200",
  somente_leitura: "bg-gray-100 text-gray-600 border-gray-200"
};

// Ícones por tela
const ICONES_TELAS: Record<string, any> = {
  "/painel/dashboard": LayoutDashboard,
  "/painel/tickets": Ticket,
  "/painel/solicitacoes": FileText,
  "/painel/clientes": Users,
  "/painel/whatsapp": MessageSquare,
  "/painel/intranet": Globe,
  "/painel/intranet/monitorador": Activity,
  "/painel/relatorios": BarChart3,
  "/painel/configuracoes": Settings
};

export function PermissoesClient() {
  const [telas, setTelas] = useState<Tela[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [populando, setPopulando] = useState(false);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    try {
      const res = await fetch("/api/permissoes-telas");
      const data = await res.json();
      setTelas(data.telas || []);
    } catch (error) {
      toast.error("Erro ao carregar permissões");
    } finally {
      setLoading(false);
    }
  }

  async function popularPermissoes() {
    setPopulando(true);
    try {
      const res = await fetch("/api/permissoes-telas/popular", {
        method: "POST"
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Erro ao popular permissões");
        return;
      }

      toast.success(data.message || "Permissões criadas com sucesso!");
      // Recarrega a lista
      carregar();
    } catch (error) {
      toast.error("Erro ao popular permissões");
    } finally {
      setPopulando(false);
    }
  }

  async function alterarPermissao(
    tela_rota: string,
    perfil: Perfil,
    tipo: "pode_acessar" | "pode_editar",
    valor: boolean
  ) {
    // Admin sempre tem acesso total - não permite alteração
    if (perfil === "admin") {
      toast.error("Permissões de Admin não podem ser alteradas");
      return;
    }

    // Se desabilitar acesso, também desabilita edição
    const podeEditar = tipo === "pode_acessar" && !valor
      ? false
      : tipo === "pode_editar"
      ? valor
      : telas.find(t => t.rota === tela_rota)?.perfis[perfil]?.pode_editar || false;

    const podeAcessar = tipo === "pode_acessar"
      ? valor
      : telas.find(t => t.rota === tela_rota)?.perfis[perfil]?.pode_acessar || false;

    setSalvando(`${tela_rota}-${perfil}-${tipo}`);

    try {
      const res = await fetch("/api/permissoes-telas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tela_rota,
          perfil,
          pode_acessar: podeAcessar,
          pode_editar: podeEditar
        })
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erro ao atualizar permissão");
        return;
      }

      // Atualiza o estado local
      setTelas(prev =>
        prev.map(t =>
          t.rota === tela_rota
            ? {
                ...t,
                perfis: {
                  ...t.perfis,
                  [perfil]: {
                    pode_acessar: podeAcessar,
                    pode_editar: podeEditar
                  }
                }
              }
            : t
        )
      );

      toast.success("Permissão atualizada!");
    } catch (error) {
      toast.error("Erro ao atualizar permissão");
    } finally {
      setSalvando(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header com legenda e botão */}
      <div className="flex items-start justify-between gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex-1">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-1">
                Como funciona o controle de acesso
              </h3>
              <p className="text-xs text-blue-700 leading-relaxed">
                Defina para cada perfil de usuário quais telas podem ser acessadas e se podem fazer edições.
                As permissões de <strong>Admin</strong> não podem ser alteradas (sempre tem acesso total).
              </p>
              <div className="flex items-center gap-4 mt-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-blue-800">Pode visualizar</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Edit className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-blue-800">Pode editar</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Botão Popular Permissões */}
        <button
          onClick={popularPermissoes}
          disabled={populando}
          className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          title="Criar/atualizar permissões padrão para todas as telas"
        >
          {populando ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Atualizando...</span>
            </>
          ) : (
            <>
              <Shield className="w-4 h-4" />
              <span className="text-sm font-medium">Popular Permissões</span>
            </>
          )}
        </button>
      </div>

      {/* Tabela de permissões */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            {/* Cabeçalho */}
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Tela
                </th>
                {PERFIS.map((perfil) => (
                  <th
                    key={perfil}
                    className="px-4 py-3 text-center"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide ${PERFIL_CORES[perfil]}`}>
                        {perfil === "admin" && <Lock className="w-3 h-3" />}
                        {PERFIL_LABELS[perfil]}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Corpo da tabela */}
            <tbody className="divide-y divide-gray-100">
              {telas.map((tela) => {
                const Icone = ICONES_TELAS[tela.rota] || Shield;

                return (
                  <tr
                    key={tela.rota}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {/* Coluna da tela */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Icone className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">
                            {tela.nome}
                          </h3>
                          <p className="text-xs text-gray-400 font-mono">
                            {tela.rota}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Colunas de perfis */}
                    {PERFIS.map((perfil) => {
                      const permissao = tela.perfis[perfil];
                      const isAdmin = perfil === "admin";
                      const chaveAcesso = `${tela.rota}-${perfil}-pode_acessar`;
                      const chaveEditar = `${tela.rota}-${perfil}-pode_editar`;
                      const salvandoAcesso = salvando === chaveAcesso;
                      const salvandoEditar = salvando === chaveEditar;

                      return (
                        <td
                          key={perfil}
                          className="px-4 py-4"
                        >
                          <div className="flex flex-col items-center gap-2">
                            {/* Botão Visualizar */}
                            <button
                              onClick={() =>
                                !isAdmin &&
                                alterarPermissao(
                                  tela.rota,
                                  perfil,
                                  "pode_acessar",
                                  !permissao.pode_acessar
                                )
                              }
                              disabled={isAdmin || salvandoAcesso}
                              title={isAdmin ? "Admin sempre tem acesso" : permissao.pode_acessar ? "Clique para bloquear acesso" : "Clique para permitir acesso"}
                              className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                isAdmin
                                  ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                                  : permissao.pode_acessar
                                  ? "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer"
                                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer"
                              }`}
                            >
                              {salvandoAcesso ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : permissao.pode_acessar ? (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Ver</span>
                                  <Check className="w-3.5 h-3.5" />
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Ver</span>
                                  <X className="w-3.5 h-3.5" />
                                </>
                              )}
                            </button>

                            {/* Botão Editar */}
                            <button
                              onClick={() =>
                                !isAdmin &&
                                permissao.pode_acessar &&
                                alterarPermissao(
                                  tela.rota,
                                  perfil,
                                  "pode_editar",
                                  !permissao.pode_editar
                                )
                              }
                              disabled={
                                isAdmin ||
                                !permissao.pode_acessar ||
                                salvandoEditar
                              }
                              title={
                                isAdmin
                                  ? "Admin sempre pode editar"
                                  : !permissao.pode_acessar
                                  ? "Habilite visualização primeiro"
                                  : permissao.pode_editar
                                  ? "Clique para bloquear edição"
                                  : "Clique para permitir edição"
                              }
                              className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                isAdmin || !permissao.pode_acessar
                                  ? "bg-gray-100 text-gray-400 cursor-not-allowed opacity-50"
                                  : permissao.pode_editar
                                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer"
                                  : "bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer"
                              }`}
                            >
                              {salvandoEditar ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : permissao.pode_editar ? (
                                <>
                                  <Edit className="w-3.5 h-3.5" />
                                  <span>Edit</span>
                                  <Check className="w-3.5 h-3.5" />
                                </>
                              ) : (
                                <>
                                  <Edit className="w-3.5 h-3.5" />
                                  <span>Edit</span>
                                  <X className="w-3.5 h-3.5" />
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {telas.length === 0 && !loading && (
        <div className="text-center py-12">
          <Shield className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 mb-4">
            Nenhuma permissão configurada ainda
          </p>
          <button
            onClick={popularPermissoes}
            disabled={populando}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {populando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Criando permissões...</span>
              </>
            ) : (
              <>
                <Shield className="w-4 h-4" />
                <span>Criar Permissões Padrão</span>
              </>
            )}
          </button>
          <p className="text-xs text-gray-400 mt-3">
            Isso criará permissões padrão para todas as telas do sistema
          </p>
        </div>
      )}
    </div>
  );
}
