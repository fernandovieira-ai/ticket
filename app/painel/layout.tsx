import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { serverCache } from "@/lib/server-cache";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

// Sempre renderiza no servidor a cada request (DB não acessível no build do Railway)
export const dynamic = "force-dynamic";
export const maxDuration = 15; // cap de 15s para evitar spinner infinito

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // BYPASS_AUTH: remover antes do deploy em produção
  const bypassAuth = process.env.BYPASS_AUTH === "true";

  const session = bypassAuth ? null : await getSession();

  if (!bypassAuth) {
    if (!session) redirect("/login");
    if (session!.perfil === "cliente") redirect("/portal/meus-tickets");
  }

  const perfil = session?.perfil ?? "admin";
  const nome = session?.nome ?? "Dev";
  const email = session?.email ?? "dev@local";
  const empresaId = session?.empresaId;

  // Cache logo por 5 minutos — evita query no DB a cada navegação
  let logoUrl: string | null = null;
  if (empresaId) {
    const cacheKey = `logo_${empresaId}`;
    const cached = serverCache.get<string | null>(cacheKey);
    if (cached !== null) {
      logoUrl = cached;
    } else {
      const empresa = await queryOne<{ logo_url: string | null }>(
        "SELECT logo_url FROM empresas WHERE id = $1",
        [empresaId],
      );
      logoUrl = empresa?.logo_url ?? null;
      serverCache.set(cacheKey, logoUrl, 5 * 60 * 1000);
    }
  } else if (bypassAuth) {
    const empresa = await queryOne<{ logo_url: string | null }>(
      "SELECT logo_url FROM empresas LIMIT 1",
    );
    logoUrl = empresa?.logo_url ?? null;
  }

  return (
    <div className="flex h-screen" style={{ backgroundColor: "var(--color-bg-root)" }}>
      <Sidebar perfil={perfil} logoUrl={logoUrl} />
      <main className="flex-1 overflow-y-auto bg-white">
        <div className="page-header">
          <Header nome={nome} email={email} titulo="DigitalRF Help" />
        </div>
        <div className="page-body">
          {children}
        </div>
      </main>
    </div>
  );
}
