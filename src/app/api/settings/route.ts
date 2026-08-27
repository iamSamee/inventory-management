import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getOrCreateSettings() {
  const existing = await prisma.settings.findFirst();
  if (existing) return existing;
  return prisma.settings.create({ data: {} });
}

export async function GET() {
  const settings = await getOrCreateSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  let body: { lowStockThreshold?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const lowStockThreshold = Number(body.lowStockThreshold);
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
    return NextResponse.json(
      { error: "Threshold must be a non-negative integer" },
      { status: 400 }
    );
  }

  const existing = await getOrCreateSettings();
  const settings = await prisma.settings.update({
    where: { id: existing.id },
    data: { lowStockThreshold },
  });

  return NextResponse.json({ settings });
}
