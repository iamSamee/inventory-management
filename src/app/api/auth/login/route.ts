import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { username } });

  // Avoid leaking whether the username exists; respond generically.
  if (!user) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const secondsLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
    return NextResponse.json(
      { error: `Account locked. Try again in ${secondsLeft} seconds.` },
      { status: 423 }
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);

  if (!valid) {
    const failedAttempts = user.failedAttempts + 1;
    const lockedUntil =
      failedAttempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_DURATION_MS)
        : null;

    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts, lockedUntil },
    });

    if (lockedUntil) {
      return NextResponse.json(
        { error: "Too many failed attempts. Account locked for 15 minutes." },
        { status: 423 }
      );
    }

    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  const token = await createSessionToken({ sub: user.id, username: user.username });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
