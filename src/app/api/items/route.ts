import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get("search")?.trim() ?? "";

  const items = await prisma.item.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ items });
}
