import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, hasValidAdminSession } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";
import { productFromDatabaseRow, productToDatabaseRow, validProduct } from "../../../../lib/products";

export const runtime = "nodejs";

async function requireAdmin() {
  const cookieStore = await cookies();
  return hasValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

function databaseUnavailable() {
  return NextResponse.json({ error: "The PostgreSQL database is not configured." }, { status: 503 });
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return databaseUnavailable();
  try {
    const products = await prisma.product.findMany({ orderBy: { sortOrder: "asc" } });
    return NextResponse.json({ products: products.map(productFromDatabaseRow) });
  } catch (error) {
    console.error("Admin could not read product catalogue:", error);
    return NextResponse.json({ error: "Could not load products from the database." }, { status: 503 });
  }
}

export async function POST(request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return databaseUnavailable();
  let product;
  try {
    ({ product } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid product data." }, { status: 400 });
  }
  if (!validProduct(product)) return NextResponse.json({ error: "Complete all required product fields with a valid price." }, { status: 400 });

  try {
    const first = await prisma.product.findFirst({ orderBy: { sortOrder: "asc" }, select: { sortOrder: true } });
    const data = productToDatabaseRow({ ...product, sortOrder: (first?.sortOrder ?? 0) - 1 });
    const saved = await prisma.product.create({ data });
    return NextResponse.json({ product: productFromDatabaseRow(saved) }, { status: 201 });
  } catch (error) {
    console.error("Admin could not create product:", error);
    return NextResponse.json({ error: "Could not save the product to the database." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return databaseUnavailable();
  let id;
  let changes;
  try {
    ({ id, ...changes } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid product update." }, { status: 400 });
  }
  if (typeof id !== "string" || !id || Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "A product and at least one change are required." }, { status: 400 });
  }
  const update = { updatedAt: new Date() };
  if (Object.hasOwn(changes, "name")) {
    if (typeof changes.name !== "string" || !changes.name.trim() || changes.name.trim().length > 200) {
      return NextResponse.json({ error: "Product name must be between 1 and 200 characters." }, { status: 400 });
    }
    update.name = changes.name.trim();
  }
  if (Object.hasOwn(changes, "price")) {
    const price = Number(changes.price);
    if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "Price must be greater than zero." }, { status: 400 });
    update.price = price;
  }
  if (Object.hasOwn(changes, "cardDescription")) {
    if (typeof changes.cardDescription !== "string") return NextResponse.json({ error: "The featured description must be text." }, { status: 400 });
    update.cardDescription = changes.cardDescription;
  }
  if (Object.keys(changes).some((key) => key !== "name" && key !== "price" && key !== "cardDescription")) {
    return NextResponse.json({ error: "Unsupported product fields." }, { status: 400 });
  }

  try {
    const saved = await prisma.product.update({ where: { id }, data: update });
    return NextResponse.json({ product: productFromDatabaseRow(saved) });
  } catch (error) {
    if (error.code === "P2025") return NextResponse.json({ error: "Product was not found." }, { status: 404 });
    console.error("Admin could not update product:", error);
    return NextResponse.json({ error: "Could not update the product in the database." }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return databaseUnavailable();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "A product ID is required." }, { status: 400 });
  try {
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error.code === "P2025") return NextResponse.json({ error: "Product was not found." }, { status: 404 });
    console.error("Admin could not remove product:", error);
    return NextResponse.json({ error: "Could not remove the product from the database." }, { status: 500 });
  }
}
