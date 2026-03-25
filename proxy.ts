import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import type { JWTPayload } from "@/types";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

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
];

// Rotas exclusivas de admin/supervisor (configurações de sistema)
const ADMIN_PATHS = [
  "/painel/configuracoes/empresa",
  "/painel/configuracoes/geral",
  "/painel/configuracoes/sla",
  "/painel/configuracoes/whatsapp",
  "/painel/configuracoes/ia",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hostname = req.headers.get("host") ?? "";

  // Detecta se o acesso é pelo domínio do portal do cliente
  // Configurar PORTAL_DOMAIN no Railway, ex: portal.digitalrf.com.br
  const isPortalDomain =
    hostname.startsWith("portal.") ||
    (process.env.PORTAL_DOMAIN !== undefined &&
      hostname === process.env.PORTAL_DOMAIN);

  // Detecta se o acesso é pelo domínio do painel interno
  // Configurar PAINEL_DOMAIN no Railway, ex: painel.digitalrf.com.br
  const isPainelDomain =
    hostname.startsWith("painel.") ||
    (process.env.PAINEL_DOMAIN !== undefined &&
      hostname === process.env.PAINEL_DOMAIN);

  // --- Roteamento por domínio ---

  if (isPortalDomain) {
    // Bloquear acesso ao painel interno pelo domínio do portal
    if (pathname.startsWith("/painel")) {
      return NextResponse.redirect(new URL("/cliente/login", req.url));
    }
    // Raiz do portal → login do cliente
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/cliente/login", req.url));
    }
  }

  if (isPainelDomain) {
    // Bloquear acesso ao portal pelo domínio do painel
    if (pathname.startsWith("/portal") || pathname.startsWith("/cliente")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    // Raiz do painel → login interno
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // --- Autenticação ---

  // Rotas públicas — sem autenticação
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isPublic) return NextResponse.next();

  // Verificar token
  const token = req.cookies.get("access_token")?.value;
  if (!token) return redirectToLogin(req, isPortalDomain);

  let payload: JWTPayload | null = null;
  try {
    const { payload: p } = await jwtVerify(token, JWT_SECRET);
    payload = p as unknown as JWTPayload;
  } catch {
    return redirectToLogin(req, isPortalDomain);
  }

  // Redirecionar raiz conforme perfil
  if (pathname === "/") {
    if (payload.perfil === "cliente") {
      return NextResponse.redirect(new URL("/portal/meus-tickets", req.url));
    }
    return NextResponse.redirect(new URL("/painel/dashboard", req.url));
  }

  // Impedir cliente de acessar painel interno
  if (pathname.startsWith("/painel") && payload.perfil === "cliente") {
    return NextResponse.redirect(new URL("/portal/meus-tickets", req.url));
  }

  // Impedir staff de acessar portal do cliente
  if (pathname.startsWith("/portal") && payload.perfil !== "cliente") {
    return NextResponse.redirect(new URL("/painel/dashboard", req.url));
  }

  // Rotas restritas a admin/supervisor
  const isAdminPath = ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isAdminPath && !["admin", "supervisor"].includes(payload.perfil)) {
    return NextResponse.redirect(new URL("/painel/dashboard", req.url));
  }

  return NextResponse.next();
}

function redirectToLogin(req: NextRequest, isPortal = false) {
  const { pathname } = req.nextUrl;

  if (isPortal || pathname.startsWith("/portal") || pathname.startsWith("/cliente")) {
    return NextResponse.redirect(new URL("/cliente/login", req.url));
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
