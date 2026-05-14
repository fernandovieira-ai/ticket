import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { JWTPayload } from "@/types";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const JWT_REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET!,
);

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// BYPASS_AUTH: sessão fake para desenvolvimento — remover antes do deploy
const DEV_SESSION: JWTPayload = {
  sub: "5a3aa105-b473-4958-8467-4ebdabec9943",
  empresaId: "00000000-0000-0000-0000-000000000001",
  perfil: "admin",
  nome: "Dev",
  email: "dev@local",
};

export async function signAccessToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN ?? "15m")
    .sign(JWT_SECRET);
}

export async function signRefreshToken(
  payload: Pick<JWTPayload, "sub" | "empresaId">,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_REFRESH_EXPIRES_IN ?? "7d")
    .sign(JWT_REFRESH_SECRET);
}

export async function verifyAccessToken(
  token: string,
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(
  token: string,
): Promise<Pick<JWTPayload, "sub" | "empresaId"> | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_REFRESH_SECRET);
    return payload as unknown as Pick<JWTPayload, "sub" | "empresaId">;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<JWTPayload | null> {
  if (process.env.BYPASS_AUTH === "true") return DEV_SESSION;
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

export function setAuthCookies(
  response: Response,
  accessToken: string,
  refreshToken: string,
): void {
  const secure = IS_PRODUCTION ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `access_token=${accessToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=7200${secure}`,
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${secure}`,
  );
}

export function clearAuthCookies(response: Response): void {
  const secure = IS_PRODUCTION ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `access_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`,
  );
  response.headers.append(
    "Set-Cookie",
    `refresh_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`,
  );
}
