import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type InLine = {
  itemId?: string;
  name?: string;
  barcode?: string;
  qty?: number;
};

export async function POST(request: NextRequest) {
  let body: { lines?: InLine[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const lines = body.lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "Add at least one item first" }, { status: 400 });
  }

  for (const line of lines) {
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json(
        { error: "Every item needs a positive whole quantity" },
        { status: 400 }
      );
    }
    if (!line.itemId && (!line.name?.trim() || !line.barcode?.trim())) {
      return NextResponse.json(
        { error: "New items need both a name and a barcode" },
        { status: 400 }
      );
    }
  }

  try {
    const results = await prisma.$transaction(async (tx) => {
      const out: { item: Awaited<ReturnType<typeof tx.item.create>>; transaction: Awaited<ReturnType<typeof tx.transaction.create>> }[] = [];
      for (const line of lines) {
        const qty = Number(line.qty);
        const item = line.itemId
          ? await tx.item.update({
              where: { id: line.itemId },
              data: { quantity: { increment: qty } },
            })
          : await tx.item.create({
              data: { name: line.name!.trim(), barcode: line.barcode!.trim(), quantity: qty },
            });
        const transaction = await tx.transaction.create({
          data: { itemId: item.id, type: "in", qtyChanged: qty },
        });
        out.push({ item, transaction });
      }
      return out;
    });
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json({ error: "One of these barcodes already exists" }, { status: 409 });
      }
      if (err.code === "P2025") {
        return NextResponse.json({ error: "One of these items was not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Failed to record inventory in" }, { status: 500 });
  }
}
