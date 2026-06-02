import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Endpoint simples para healthcheck - sem autenticação
export async function GET() {
  const buildId = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || "dev";

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    buildId,
    version: "1.0.0",
    env: process.env.NODE_ENV,
  });
}