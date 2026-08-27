import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type OutLine = {
  itemId?: string;
  qty?: number;
};

export async function POST(request: NextRequest) {
  let body: { lines?: OutLine[] };
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
    if (!line.itemId || !Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json(
        { error: "Every item needs a positive whole quantity" },
        { status: 400 }
      );
    }
  }

  try {
    const results = await prisma.$transaction(async (tx) => {
      const out: { item: Awaited<ReturnType<typeof tx.item.findUniqueOrThrow>>; transaction: Awaited<ReturnType<typeof tx.transaction.create>> }[] = [];
      for (const line of lines) {
        const qty = Number(line.qty);
        const updated = await tx.item.updateMany({
          where: { id: line.itemId, quantity: { gte: qty } },
          data: { quantity: { decrement: qty } },
        });
        if (updated.count === 0) {
          const item = await tx.item.findUnique({ where: { id: line.itemId } });
          const name = item?.name ?? "Item";
          const available = item?.quantity ?? 0;
          throw new Error(`INSUFFICIENT_STOCK:${name}:${available}`);
        }
        const item = await tx.item.findUniqueOrThrow({ where: { id: line.itemId } });
        const transaction = await tx.transaction.create({
          data: { itemId: item.id, type: "out", qtyChanged: qty },
        });
        out.push({ item, transaction });
      }
      return out;
    });
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("INSUFFICIENT_STOCK:")) {
      const [, name, available] = err.message.split(":");
      return NextResponse.json(
        { error: `${name} only has ${available} in stock — reduce the quantity and try again.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to record inventory out" }, { status: 500 });
  }
}
