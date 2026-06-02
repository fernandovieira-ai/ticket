import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import type { JWTPayload } from "@/types";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const JWT_REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET!,
);

/**
 * Adiciona headers de versão e segurança em todas as respostas
 */
function addCommonHeaders(response: NextResponse, isServerAction = false): NextResponse {
  const buildId = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || "dev";

  response.headers.set("X-Build-Version", buildId);
  response.headers.set("X-DNS-Prefetch-Control", "on");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");

  // Para Server Actions, adiciona cache apropriado
  if (isServerAction) {
    response.headers.set("Cache-Control", "no-store, must-revalidate");
  }

  return response;
}

// Rotas públicas (não exigem auth)
const PUBLIC_PATHS = [
  "/login",
  "/recuperar-senha",
  "/redefinir-senha",
  "/api/auth/recuperar-senha",
  "/api/auth/redefinir-senha",
  "/cliente/login",
  "/cliente/cadastro",
  "/cliente/recuperar-senha",
  "/api/auth/login",
  "/api/auth/cliente/login",
  "/api/auth/cliente/cadastro",
  "/api/auth/cliente/recuperar-senha",
  "/api/auth/cliente/redefinir-senha",
  "/cliente/redefinir-senha",
  "/api/auth/refresh",
  "/api/assets",
  "/api/cnpj",
  "/api/whatsapp/webhook",
  "/api/cron/monitorar-grupos",
];

// Rotas exclusivas de admin/supervisor (configurações de sistema)
const ADMIN_PATHS = [
  "/painel/configuracoes/empresa",
  "/painel/configuracoes/geral",
  "/painel/configuracoes/sla",
  "/painel/configuracoes/whatsapp",
  "/painel/configuracoes/ia",
];

/**
 * Verifica se o access_token é válido e tem mais de 60s de vida restante.
 */
async function isAccessTokenFresh(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const exp = (payload.exp ?? 0) * 1000;
    return Date.now() < exp - 10_000;
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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hostname = req.headers.get("host") ?? "";
  const isServerAction = req.headers.has("Next-Action");

  // Detecta se o acesso é pelo domínio do portal do cliente
  const isPortalDomain =
    hostname.startsWith("portal.") ||
    (process.env.PORTAL_DOMAIN !== undefined &&
      hostname === process.env.PORTAL_DOMAIN);

  // Detecta se o acesso é pelo domínio do painel interno
  const isPainelDomain =
    hostname.startsWith("painel.") ||
    (process.env.PAINEL_DOMAIN !== undefined &&
      hostname === process.env.PAINEL_DOMAIN);

  // --- Roteamento por domínio ---

  if (isPortalDomain) {
    if (pathname.startsWith("/painel")) {
      return addCommonHeaders(NextResponse.redirect(new URL("/cliente/login", req.url)));
    }
    if (pathname === "/") {
      return addCommonHeaders(NextResponse.redirect(new URL("/cliente/login", req.url)));
    }
  }

  if (isPainelDomain) {
    if (pathname.startsWith("/portal") || pathname.startsWith("/cliente")) {
      return addCommonHeaders(NextResponse.redirect(new URL("/login", req.url)));
    }
    if (pathname === "/") {
      return addCommonHeaders(NextResponse.redirect(new URL("/login", req.url)));
    }
  }

  // --- Autenticação ---

  // Rotas públicas — sem autenticação
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isPublic) return addCommonHeaders(NextResponse.next(), isServerAction);

  // Desenvolvimento sem autenticação: passa tudo
  if (process.env.BYPASS_AUTH === "true") return addCommonHeaders(NextResponse.next(), isServerAction);

  const accessToken = req.cookies.get("access_token")?.value;
  const refreshToken = req.cookies.get("refresh_token")?.value;
  const isApiRoute = pathname.startsWith("/api/");

  // 1. Access token válido e "fresco" — verifica roles e prossegue
  if (accessToken && (await isAccessTokenFresh(accessToken))) {
    return applyRoleChecks(req, accessToken, isPortalDomain, isServerAction);
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
        const setCookies = refreshRes.headers.getSetCookie();

        let newAccessToken: string | undefined;
        for (const cookie of setCookies) {
          const match = cookie.match(/^access_token=([^;]+)/);
          if (match) {
            newAccessToken = match[1];
            break;
          }
        }

        const requestHeaders = new Headers(req.headers);
        if (newAccessToken) {
          const existing = (req.headers.get("cookie") ?? "")
            .split("; ")
            .filter((c) => !c.startsWith("access_token="));
          existing.push(`access_token=${newAccessToken}`);
          requestHeaders.set("cookie", existing.join("; "));
        }

        const roleResponse = newAccessToken
          ? await applyRoleChecks(req, newAccessToken, isPortalDomain, isServerAction)
          : addCommonHeaders(NextResponse.next({ request: { headers: requestHeaders } }), isServerAction);

        // Se applyRoleChecks retornou um redirect, preserva mas ainda envia os cookies
        const response =
          roleResponse.status === 307 || roleResponse.status === 308
            ? roleResponse
            : NextResponse.next({ request: { headers: requestHeaders } });

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
    return addCommonHeaders(
      NextResponse.json(
        { error: "Sessão expirada", code: "SESSION_EXPIRED" },
        { status: 401 },
      ),
      isServerAction
    );
  }

  return addCommonHeaders(redirectToLogin(req, isPortalDomain), isServerAction);
}

async function applyRoleChecks(
  req: NextRequest,
  token: string,
  isPortalDomain: boolean,
  isServerAction = false,
): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  let payload: JWTPayload | null = null;
  try {
    const { payload: p } = await jwtVerify(token, JWT_SECRET);
    payload = p as unknown as JWTPayload;
  } catch {
    return addCommonHeaders(redirectToLogin(req, isPortalDomain), isServerAction);
  }

  // Redirecionar raiz conforme perfil
  if (pathname === "/") {
    if (payload.perfil === "cliente") {
      return addCommonHeaders(NextResponse.redirect(new URL("/portal/meus-tickets", req.url)), isServerAction);
    }
    return addCommonHeaders(NextResponse.redirect(new URL("/painel/dashboard", req.url)), isServerAction);
  }

  // Impedir cliente de acessar painel interno
  if (pathname.startsWith("/painel") && payload.perfil === "cliente") {
    return addCommonHeaders(NextResponse.redirect(new URL("/portal/meus-tickets", req.url)), isServerAction);
  }

  // Impedir staff de acessar portal do cliente
  if (pathname.startsWith("/portal") && payload.perfil !== "cliente") {
    return addCommonHeaders(NextResponse.redirect(new URL("/painel/dashboard", req.url)), isServerAction);
  }

  // Rotas restritas a admin/supervisor
  const isAdminPath = ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isAdminPath && !["admin", "supervisor"].includes(payload.perfil)) {
    return addCommonHeaders(NextResponse.redirect(new URL("/painel/dashboard", req.url)), isServerAction);
  }

  return addCommonHeaders(NextResponse.next(), isServerAction);
}

function redirectToLogin(req: NextRequest, isPortal = false) {
  const { pathname } = req.nextUrl;

  if (
    isPortal ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/cliente")
  ) {
    return NextResponse.redirect(new URL("/cliente/login", req.url));
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
