import { NextRequest, NextResponse } from "next/server";

// GET /api/cnpj/[cnpj]
// Proxy server-side para BrasilAPI — evita CORS e protege o cliente
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cnpj: string }> },
) {
  const { cnpj } = await params;

  // Validação estrita: apenas 14 dígitos — previne injeção / SSRF
  const digits = cnpj.replace(/\D/g, "");
  if (!/^\d{14}$/.test(digits)) {
    return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
  }

  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; digitalrf-help/1.0)",
        Accept: "application/json",
      },
      next: { revalidate: 3600 },
    });

    const text = await resp.text();

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("[GET /api/cnpj] resposta não-JSON:", text.slice(0, 200));
      return NextResponse.json(
        { error: "Serviço de CNPJ indisponível. Tente novamente." },
        { status: 502 },
      );
    }

    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    console.error("[GET /api/cnpj]", err);
    return NextResponse.json(
      { error: "Erro ao consultar CNPJ" },
      { status: 500 },
    );
  }
}
