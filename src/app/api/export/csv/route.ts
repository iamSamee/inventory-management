import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET() {
  const items = await prisma.item.findMany({ orderBy: { name: "asc" } });

  const header = ["Name", "Barcode", "Quantity"];
  const rows = items.map((item) => [item.name, item.barcode, item.quantity]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventory-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
