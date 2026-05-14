import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get("access_token")?.value;
  const refreshToken = req.cookies.get("refresh_token")?.value;

  const debug = {
    timestamp: new Date().toISOString(),
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
    accessTokenLength: accessToken?.length,
    refreshTokenLength: refreshToken?.length,
  };

  if (accessToken) {
    try {
      const { payload } = await jwtVerify(accessToken, JWT_SECRET);
      const exp = (payload.exp ?? 0) * 1000;
      const now = Date.now();
      const timeUntilExpiry = exp - now;
      const isFresh = now < exp - 10_000;

      Object.assign(debug, {
        tokenValid: true,
        expiresAt: new Date(exp).toISOString(),
        timeUntilExpiryMs: timeUntilExpiry,
        timeUntilExpiryMin: Math.round(timeUntilExpiry / 60000),
        isFresh,
        userId: payload.sub,
        perfil: payload.perfil,
        nome: payload.nome,
      });
    } catch (err) {
      Object.assign(debug, {
        tokenValid: false,
        tokenError: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json(debug);
}