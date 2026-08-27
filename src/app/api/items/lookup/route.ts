import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const item =
    (await prisma.item.findUnique({ where: { barcode: query } })) ??
    (await prisma.item.findFirst({
      where: { name: { equals: query, mode: "insensitive" } },
    }));

  return NextResponse.json({ item });
}
