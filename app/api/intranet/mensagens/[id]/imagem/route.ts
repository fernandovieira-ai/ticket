import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { queryIntranet } from "@/lib/db-unified";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return new NextResponse("Não autenticado", { status: 401 });

  const { id } = await params;

  const result = await queryIntranet(
    "SELECT imagem, tipo_imagem FROM mensagens WHERE id = $1",
    [id]
  );

  if (result.rows.length === 0 || !result.rows[0].imagem) {
    return new NextResponse("Imagem não encontrada", { status: 404 });
  }

  const { imagem, tipo_imagem } = result.rows[0];
  const contentType = tipo_imagem ?? "image/jpeg";

  return new NextResponse(imagem, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
