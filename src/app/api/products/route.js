import { NextResponse } from "next/server";
import { initialProducts } from "../../../lib/catalog";
import { prisma } from "../../../lib/prisma";
import { productFromDatabaseRow } from "../../../lib/products";

export const runtime = "nodejs";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({ products: initialProducts });
    }

    return NextResponse.json(
      { error: "PostgreSQL is not configured. Set DATABASE_URL in .env.local, apply the Prisma schema, and seed the product catalogue." },
      { status: 503 },
    );
  }

  try {
    const products = await prisma.product.findMany({ orderBy: { sortOrder: "asc" } });
    return NextResponse.json({ products: products.map(productFromDatabaseRow) });
  } catch (error) {
    console.error("Could not read the product catalogue:", error);
    return NextResponse.json({ error: "Could not load products from the PostgreSQL database." }, { status: 503 });
  }
}
