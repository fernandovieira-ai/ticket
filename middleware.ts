import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Adiciona header de versão do build para debugging
  const buildId = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || "dev";
  response.headers.set("X-Build-Version", buildId);

  // Para Server Actions, adiciona headers de cache apropriados
  if (request.headers.get("Next-Action")) {
    response.headers.set("Cache-Control", "no-store, must-revalidate");
    response.headers.set("X-Content-Type-Options", "nosniff");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
