import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PermissoesClient } from "./permissoes-client";

export async function PermissoesServer() {
  const session = await getSession();

  // Apenas admin pode acessar
  if (!session || session.perfil !== "admin") {
    redirect("/painel/dashboard");
  }

  return <PermissoesClient />;
}
