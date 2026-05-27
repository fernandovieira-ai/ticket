import {
  Ticket,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { TicketsSemAtribuir } from "./tickets-sem-atribuir";
import { SenhaLZT } from "./senha-lzt";
import { MuralRecados } from "./mural-recados";

// Sempre renderiza no servidor a cada request (DB não acessível no build do Railway)
export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface StatRow {
  total: number;
}
interface TicketRecente {
  id: string;
  numero: string;
  titulo: string;
  status_nome: string;
  status_cor: string;
  prioridade_nome: string;
  prioridade_cor: string;
  categoria_nome: string | null;
  cliente_nome: string | null;
  atribuido_nome: string | null;
  criado_em: Date;
}
interface PrioRow {
  prioridade_nome: string;
  prioridade_cor: string;
  total: number;
}
interface UsuarioTickets {
  usuario_nome: string;
  total: number;
}
interface UsuarioSolicitacoes {
  usuario_nome: string;
  total: number;
}
interface InformativoDash {
  id: number;
  titulo: string;
  descricao: string;
  dta_validade: string | null;
  criado_em: string;
}
async function DashboardContent({
  empresaId,
  nome,
  perfil,
}: {
  empresaId: string;
  nome: string;
  perfil: string;
}) {
  const [
    abertos,
    emAndamento,
    resolvidosHoje,
    clientesAtivos,
    ticketsRecentes,
    porPrioridade,
    porUsuario,
    solicitacoesPorUsuario,
    informativosAtivos,
  ] = await Promise.all([
    // Abertos
    query<StatRow>(
      `SELECT COUNT(*)::int AS total
         FROM tickets t
         JOIN ticket_status ts ON ts.id = t.status_id
         WHERE t.empresa_id = $1 AND ts.codigo = 'aberto'`,
      [empresaId],
    ),
    // Em andamento
    query<StatRow>(
      `SELECT COUNT(*)::int AS total
         FROM tickets t
         JOIN ticket_status ts ON ts.id = t.status_id
         WHERE t.empresa_id = $1 AND ts.codigo = 'em_andamento'`,
      [empresaId],
    ),
    // Resolvidos hoje
    query<StatRow>(
      `SELECT COUNT(*)::int AS total
         FROM tickets t
         JOIN ticket_status ts ON ts.id = t.status_id
         WHERE t.empresa_id = $1
           AND ts.codigo IN ('finalizado', 'cancelado')
           AND t.atualizado_em >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')`,
      [empresaId],
    ),
    // Clientes ativos
    query<StatRow>(
      `SELECT COUNT(*)::int AS total
         FROM clientes
         WHERE empresa_id = $1 AND ativo = true`,
      [empresaId],
    ),
    // Tickets recentes
    query<TicketRecente>(
      `SELECT t.id, t.numero, t.titulo, t.criado_em,
                ts.nome AS status_nome, ts.cor AS status_cor,
                tp.nome AS prioridade_nome, tp.cor AS prioridade_cor,
                cat.nome AS categoria_nome,
                c.nome_razao AS cliente_nome,
                u.nome AS atribuido_nome
         FROM tickets t
         JOIN ticket_status ts ON ts.id = t.status_id
         JOIN ticket_prioridades tp ON tp.id = t.prioridade_id
         LEFT JOIN categorias cat ON cat.id = t.categoria_id
         LEFT JOIN clientes c ON c.id = t.cliente_id
         LEFT JOIN usuarios u ON u.id = t.atribuido_a
         WHERE t.empresa_id = $1
           AND t.atribuido_a IS NULL
           AND ts.codigo NOT IN ('finalizado', 'cancelado')
         ORDER BY t.criado_em DESC
         LIMIT 10`,
      [empresaId],
    ),
    // Por prioridade (abertos + em andamento)
    query<PrioRow>(
      `SELECT tp.nome AS prioridade_nome, tp.cor AS prioridade_cor, COUNT(*)::int AS total
         FROM tickets t
         JOIN ticket_prioridades tp ON tp.id = t.prioridade_id
         JOIN ticket_status ts ON ts.id = t.status_id
         WHERE t.empresa_id = $1 AND ts.encerra = false
         GROUP BY tp.nome, tp.cor, tp.ordem
         ORDER BY tp.ordem DESC`,
      [empresaId],
    ),
    // Por usuário atribuído (não-clientes, tickets em aberto)
    query<UsuarioTickets>(
      `SELECT u.nome AS usuario_nome, COUNT(*)::int AS total
         FROM tickets t
         JOIN usuarios u ON u.id = t.atribuido_a
         JOIN ticket_status ts ON ts.id = t.status_id
         WHERE t.empresa_id = $1
           AND u.perfil != 'cliente'
           AND ts.encerra = false
         GROUP BY u.nome
         ORDER BY total DESC`,
      [empresaId],
    ),
    // Solicitações internas por usuário responsável (em aberto)
    query<UsuarioSolicitacoes>(
      `SELECT u.nome AS usuario_nome, COUNT(*)::int AS total
         FROM solicitacoes_internas s
         JOIN usuarios u ON u.id = s.responsavel_id
         WHERE s.empresa_id = $1
           AND u.perfil != 'cliente'
           AND s.status NOT IN ('concluida', 'cancelada')
         GROUP BY u.nome
         ORDER BY total DESC`,
      [empresaId],
    ),
    // Informativos ativos da intranet
    query<InformativoDash>(
      `SELECT id, titulo, descricao, dta_validade, criado_em
         FROM intranet.informativos
         WHERE dta_validade >= CURRENT_DATE OR dta_validade IS NULL
         ORDER BY criado_em DESC
         LIMIT 5`,
    ),
  ]);

  const cards = [
    {
      title: "Abertos",
      value: abertos[0]?.total ?? 0,
      icon: <Ticket className="w-5 h-5 text-blue-500" />,
      color: "text-blue-600",
      href: "/painel/tickets/status/aberto",
    },
    {
      title: "Em Andamento",
      value: emAndamento[0]?.total ?? 0,
      icon: <Clock className="w-5 h-5 text-amber-500" />,
      color: "text-amber-600",
      href: "/painel/tickets/status/em_andamento",
    },
    {
      title: "Resolvidos Hoje",
      value: resolvidosHoje[0]?.total ?? 0,
      icon: <CheckCircle className="w-5 h-5 text-green-500" />,
      color: "text-green-600",
      href: "/painel/tickets/status/resolvidos",
    },
    {
      title: "Clientes Ativos",
      value: clientesAtivos[0]?.total ?? 0,
      icon: <Users className="w-5 h-5 text-purple-500" />,
      color: "text-purple-600",
      href: "/painel/clientes",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div>
        <h2
          style={{
            fontSize: 17,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.3px",
            lineHeight: 1.3,
          }}
        >
          Olá, {nome} 👋
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-text-muted)",
            marginTop: 2,
          }}
        >
          Resumo de hoje
        </p>
      </div>

      {/* Grid de KPIs — 4 colunas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {cards.map((card) => (
          <Link key={card.title} href={card.href}>
            <div
              className="dash-kpi-card"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                border: "0.5px solid var(--color-border)",
                borderRadius: 10,
                padding: "12px 14px",
                cursor: "pointer",
                transition: "border-color var(--transition)",
              }}
            >
              <div
                className="flex items-center justify-between"
                style={{ marginBottom: 6 }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {card.title}
                </p>
                {card.icon}
              </div>
              <p
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: "-0.5px",
                  lineHeight: 1,
                  color: "var(--color-text-primary)",
                }}
              >
                {card.value}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Tickets recentes */}
        <div className="lg:col-span-2 space-y-4">
          <div
            style={{
              backgroundColor: "var(--color-bg-primary)",
              border: "0.5px solid var(--color-border)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{
                padding: "12px 16px",
                borderBottom: "0.5px solid var(--color-border)",
              }}
            >
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  letterSpacing: "-0.3px",
                }}
              >
                Chamados Sem Atendente
              </p>
              <Link
                href="/painel/tickets"
                className="flex items-center gap-1"
                style={{
                  fontSize: 12,
                  color: "var(--color-brand)",
                  fontWeight: 500,
                }}
              >
                Ver todos <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <TicketsSemAtribuir tickets={ticketsRecentes} />
          </div>

          {/* Chamados por usuário */}
          <div
            style={{
              backgroundColor: "var(--color-bg-primary)",
              border: "0.5px solid var(--color-border)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "0.5px solid var(--color-border)",
              }}
            >
              <p
                className="flex items-center gap-2"
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  letterSpacing: "-0.3px",
                }}
              >
                <Users className="w-4 h-4 text-blue-500" />
                Chamados por Atendente
              </p>
            </div>
            <div style={{ padding: "12px 16px" }} className="space-y-2">
              {porUsuario.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                  Nenhum chamado atribuído no momento.
                </p>
              ) : (
                porUsuario.map((u) => {
                  const max = porUsuario[0].total;
                  const pct = Math.round((u.total / max) * 100);
                  return (
                    <div key={u.usuario_nome} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {u.usuario_nome}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--color-text-primary)",
                            minWidth: 24,
                            textAlign: "right",
                          }}
                        >
                          {u.total}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 4,
                          borderRadius: 4,
                          backgroundColor: "var(--color-bg-secondary)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            borderRadius: 4,
                            backgroundColor: "var(--color-brand)",
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Solicitações internas por usuário */}
          <div
            style={{
              backgroundColor: "var(--color-bg-primary)",
              border: "0.5px solid var(--color-border)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "0.5px solid var(--color-border)",
              }}
            >
              <p
                className="flex items-center gap-2"
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  letterSpacing: "-0.3px",
                }}
              >
                <Users className="w-4 h-4 text-orange-500" />
                Solicitações Internas por Atendente
              </p>
            </div>
            <div style={{ padding: "12px 16px" }} className="space-y-2">
              {solicitacoesPorUsuario.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                  Nenhuma solicitação atribuída no momento.
                </p>
              ) : (
                solicitacoesPorUsuario.map((u) => {
                  const max = solicitacoesPorUsuario[0].total;
                  const pct = Math.round((u.total / max) * 100);
                  return (
                    <div key={u.usuario_nome} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {u.usuario_nome}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--color-text-primary)",
                            minWidth: 24,
                            textAlign: "right",
                          }}
                        >
                          {u.total}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 4,
                          borderRadius: 4,
                          backgroundColor: "var(--color-bg-secondary)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${pct}%`,
                            borderRadius: 4,
                            backgroundColor: "#f97316", // orange-500
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Mural de Recados */}
          <MuralRecados usuarioNome={nome} usuarioPerfil={perfil} />
        </div>

        {/* Painel lateral */}
        <div className="space-y-4">
          {/* Senha LZT */}
          <SenhaLZT />

          {/* Por prioridade */}
          <div
            style={{
              backgroundColor: "var(--color-bg-primary)",
              border: "0.5px solid var(--color-border)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "0.5px solid var(--color-border)",
              }}
            >
              <p
                className="flex items-center gap-2"
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  letterSpacing: "-0.3px",
                }}
              >
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Por Prioridade
              </p>
            </div>
            <div style={{ padding: "12px 16px" }} className="space-y-3">
              {porPrioridade.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                  Sem tickets em aberto.
                </p>
              ) : (
                porPrioridade.map((p) => (
                  <div
                    key={p.prioridade_nome}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full shrink-0"
                        style={{
                          width: 8,
                          height: 8,
                          backgroundColor: p.prioridade_cor,
                          display: "inline-block",
                        }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {p.prioridade_nome}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: p.prioridade_cor,
                      }}
                    >
                      {p.total}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Ações rápidas */}
          <div
            style={{
              backgroundColor: "var(--color-bg-primary)",
              border: "0.5px solid var(--color-border)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "0.5px solid var(--color-border)",
              }}
            >
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--color-text-primary)",
                  letterSpacing: "-0.3px",
                }}
              >
                Ações Rápidas
              </p>
            </div>
            <div style={{ padding: "10px 12px" }} className="space-y-1.5">
              <Link
                href="/painel/tickets?novo=1"
                className="dash-action-primary flex items-center justify-between w-full rounded-lg transition-colors"
                style={{
                  padding: "7px 12px",
                  backgroundColor: "var(--color-brand-light)",
                  color: "var(--color-brand)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Novo Ticket
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/painel/clientes"
                className="dash-action-secondary flex items-center justify-between w-full rounded-lg transition-colors"
                style={{
                  padding: "7px 12px",
                  backgroundColor: "var(--color-bg-secondary)",
                  color: "var(--color-text-secondary)",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                Ver Clientes
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/painel/tickets?fila=1"
                className="dash-action-secondary flex items-center justify-between w-full rounded-lg transition-colors"
                style={{
                  padding: "7px 12px",
                  backgroundColor: "var(--color-bg-secondary)",
                  color: "var(--color-text-secondary)",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                Fila de Tickets
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/painel/intranet/informativos"
                className="dash-action-secondary flex items-center justify-between w-full rounded-lg transition-colors"
                style={{
                  padding: "7px 12px",
                  backgroundColor: "var(--color-bg-secondary)",
                  color: "var(--color-text-secondary)",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                Gerenciar Informativos
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Informativos ativos */}
          <div
            style={{
              backgroundColor: "var(--color-bg-primary)",
              border: "0.5px solid var(--color-border)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--color-border)" }}
            >
              <p
                style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}
              >
                📢 Informativos
              </p>
              <Link
                href="/painel/intranet/informativos"
                style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 500 }}
              >
                Ver todos →
              </Link>
            </div>
            <div style={{ padding: "10px 12px" }} className="space-y-2">
              {informativosAtivos.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "4px 0" }}>
                  Nenhum informativo ativo.
                </p>
              ) : (
                informativosAtivos.map((inf) => (
                  <div
                    key={inf.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      backgroundColor: "var(--color-bg-secondary)",
                      border: "0.5px solid var(--color-border)",
                    }}
                  >
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 3 }}>
                      {inf.titulo}
                    </p>
                    <p
                      className="informativo-descricao"
                      style={{
                        fontSize: 11,
                        color: "var(--color-text-muted)",
                        lineHeight: 1.6,
                      }}
                      dangerouslySetInnerHTML={{ __html: inf.descricao }}
                    />
                    {inf.dta_validade && (
                      <p style={{ fontSize: 10, color: "var(--color-text-muted)", marginTop: 4 }}>
                        Válido até {new Date(inf.dta_validade + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  const empresaId =
    session?.empresaId ?? "00000000-0000-0000-0000-000000000001";
  const nome = session?.nome ?? "Dev";
  const perfil = session?.perfil ?? "";

  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <div>
            <div className="h-6 w-48 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mt-1" />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-20 bg-gray-100 rounded-xl animate-pulse"
              />
            ))}
          </div>
        </div>
      }
    >
      <DashboardContent empresaId={empresaId} nome={nome} perfil={perfil} />
    </Suspense>
  );
}
