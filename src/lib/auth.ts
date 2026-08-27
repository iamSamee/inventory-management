import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12 hours

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string;
  username: string;
};

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ username: payload.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string" || typeof payload.username !== "string") {
      return null;
    }
    return { sub: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = SESSION_DURATION_SECONDS;
