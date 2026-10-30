import { NextResponse } from "next/server";
import { initialProducts } from "../../../lib/catalog";
import { prisma } from "../../../lib/prisma";
import { productFromDatabaseRow } from "../../../lib/products";

export const runtime = "nodejs";

const transientDatabaseErrorCodes = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
const productQueryRetryDelays = [250, 500, 1000];

async function findProductsWithRetry() {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.product.findMany({ orderBy: { sortOrder: "asc" } });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      const retryDelay = productQueryRetryDelays[attempt];
      if (!transientDatabaseErrorCodes.has(code) || retryDelay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}

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
    const products = await findProductsWithRetry();
    return NextResponse.json({ products: products.map(productFromDatabaseRow) });
  } catch (error) {
    console.error("Could not read the product catalogue:", error);
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (process.env.NODE_ENV === "development" && transientDatabaseErrorCodes.has(code)) {
      console.warn("Using the local starter catalogue while PostgreSQL is unavailable.");
      return NextResponse.json({ products: initialProducts });
    }
    return NextResponse.json({ error: "Could not load products from the PostgreSQL database." }, { status: 503 });
  }
}
