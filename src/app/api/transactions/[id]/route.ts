import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({ where: { id } });
      if (!transaction) return null;

      const delta =
        transaction.type === "in" ? -transaction.qtyChanged : transaction.qtyChanged;

      const item = await tx.item.findUnique({ where: { id: transaction.itemId } });
      if (!item) return null;

      const newQuantity = item.quantity + delta;
      if (newQuantity < 0) {
        throw new Error("UNDO_WOULD_GO_NEGATIVE");
      }

      const updatedItem = await tx.item.update({
        where: { id: item.id },
        data: { quantity: newQuantity },
      });

      await tx.transaction.delete({ where: { id } });

      return { item: updatedItem };
    });

    if (!result) {
      return NextResponse.json({ error: "Transaction already undone or not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "UNDO_WOULD_GO_NEGATIVE") {
      return NextResponse.json(
        { error: "Cannot undo: quantity has changed since this transaction." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to undo transaction" }, { status: 500 });
  }
}
