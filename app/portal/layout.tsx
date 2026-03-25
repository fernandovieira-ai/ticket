import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { PortalUserMenu } from "./_components/portal-user-menu";
import { PortalLogoImage } from "./_components/portal-logo-image";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) redirect("/cliente/login");
  if (session.perfil !== "cliente") redirect("/painel/dashboard");

  const empresa = session.empresaId
    ? await queryOne<{ logo_url: string | null }>(
        "SELECT logo_url FROM empresas WHERE id = $1",
        [session.empresaId],
      )
    : null;
  const logoUrl = empresa?.logo_url ?? null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 flex-shrink-0">
        <div className="px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PortalLogoImage logoUrl={logoUrl} />
            <span className="font-semibold text-gray-900 text-sm">
              DigitalRF Help
            </span>
          </div>

          <div className="flex items-center gap-2">
            <PortalUserMenu nome={session.nome} />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-y-auto px-4 py-4">
        {children}
      </main>
    </div>
  );
}
