import { NextResponse } from "next/server";

// Endpoint simples para healthcheck - sem autenticação
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.0.0"
  });
}