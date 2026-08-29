import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { name?: string; barcode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = body.name?.trim();
  const barcode = body.barcode?.trim();
  if (!name || !barcode) {
    return NextResponse.json({ error: "Name and barcode are both required" }, { status: 400 });
  }

  try {
    const item = await prisma.item.update({
      where: { id },
      data: { name, barcode },
    });
    return NextResponse.json({ item });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json(
          { error: "That barcode is already used by another item" },
          { status: 409 }
        );
      }
      if (err.code === "P2025") {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.item.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
