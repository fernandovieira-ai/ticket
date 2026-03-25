import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const JWT_REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET!,
);

export const config = {
  matcher: [
    // Rotas de página protegidas
    "/painel/:path*",
    "/portal/:path*",
    // Rotas de API protegidas — exceto endpoints de autenticação
    "/api/((?!auth/).*)",
  ],
};

/**
 * Verifica se o access_token é válido e tem mais de 60s de vida restante.
 * Se tiver menos de 60s, considera "vencendo" e força o refresh proativo.
 */
async function isAccessTokenFresh(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const exp = (payload.exp ?? 0) * 1000;
    return Date.now() < exp - 60_000; // válido com mais de 1 minuto de folga
  } catch {
    return false;
  }
}

/**
 * Verifica assinatura e expiração do refresh_token.
 */
async function isRefreshTokenValid(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWT_REFRESH_SECRET);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  // Desenvolvimento sem autenticação: passa tudo
  if (process.env.BYPASS_AUTH === "true") return NextResponse.next();

  const accessToken = req.cookies.get("access_token")?.value;
  const refreshToken = req.cookies.get("refresh_token")?.value;
  const pathname = req.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api/");

  // 1. Access token válido e "fresco" — prossegue normalmente
  if (accessToken && (await isAccessTokenFresh(accessToken))) {
    return NextResponse.next();
  }

  // 2. Access token expirado/ausente — tenta renovar com o refresh token
  if (refreshToken && (await isRefreshTokenValid(refreshToken))) {
    try {
      const refreshUrl = new URL("/api/auth/refresh", req.url);
      const refreshRes = await fetch(refreshUrl.toString(), {
        method: "POST",
        headers: { cookie: req.headers.get("cookie") ?? "" },
      });

      if (refreshRes.ok) {
        // Extrai os novos cookies do endpoint de refresh
        const setCookies = refreshRes.headers.getSetCookie();

        // Localiza o novo access_token para repassar ao handler atual
        let newAccessToken: string | undefined;
        for (const cookie of setCookies) {
          const match = cookie.match(/^access_token=([^;]+)/);
          if (match) {
            newAccessToken = match[1];
            break;
          }
        }

        // Reconstrói o cabeçalho cookie com o token renovado
        // para que o handler desta mesma requisição já o enxergue
        const requestHeaders = new Headers(req.headers);
        if (newAccessToken) {
          const existing = (req.headers.get("cookie") ?? "")
            .split("; ")
            .filter((c) => !c.startsWith("access_token="));
          existing.push(`access_token=${newAccessToken}`);
          requestHeaders.set("cookie", existing.join("; "));
        }

        const response = NextResponse.next({
          request: { headers: requestHeaders },
        });

        // Envia as novas cookies ao browser para persistir o refresh
        for (const cookie of setCookies) {
          response.headers.append("Set-Cookie", cookie);
        }

        return response;
      }
    } catch {
      // Falha na chamada interna de refresh — cai para redirecionar/401
    }
  }

  // 3. Nem access nem refresh válidos — nega o acesso
  if (isApiRoute) {
    return NextResponse.json(
      { error: "Sessão expirada", code: "SESSION_EXPIRED" },
      { status: 401 },
    );
  }

  // Redireciona para o login correto conforme o contexto da rota
  const loginPath = pathname.startsWith("/portal")
    ? "/cliente/login"
    : "/login";
  const redirectUrl = new URL(loginPath, req.url);
  redirectUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(redirectUrl);
}
