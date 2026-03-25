import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { GeralClient } from "./geral-client";
import type { Empresa } from "@/types";

export default async function GeralPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const empresa = await queryOne<Empresa>(
    `SELECT * FROM empresas WHERE id = $1`,
    [session.empresaId],
  );

  if (!empresa) redirect("/painel");

  return (
    <div className="h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white -mx-6 -mt-6 mb-0">
        <h2 className="text-base font-semibold text-gray-900">Geral</h2>
        <p className="text-gray-400 text-xs mt-0.5">
          Configurações gerais do sistema
        </p>
      </div>
      <GeralClient empresa={empresa} />
    </div>
  );
}
