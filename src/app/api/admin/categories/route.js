import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, hasValidAdminSession } from "../../../../lib/admin-auth";
import { normalizeProductCategoryName, productCategories } from "../../../../lib/catalog";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";

async function requireAdmin() {
  const cookieStore = await cookies();
  return hasValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function POST(request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "The PostgreSQL database is not configured." }, { status: 503 });

  let name;
  try {
    const body = await request.json();
    name = normalizeProductCategoryName(body?.name);
  } catch {
    return NextResponse.json({ error: "Invalid category data." }, { status: 400 });
  }

  if (!name || name.length > 50) {
    return NextResponse.json({ error: "Category names must be between 1 and 50 characters." }, { status: 400 });
  }
  if (name.toLowerCase() === "all") {
    return NextResponse.json({ error: "\"All\" is reserved for the unfiltered category view." }, { status: 409 });
  }
  if (productCategories.some((category) => category.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "That category already exists." }, { status: 409 });
  }

  try {
    const category = await prisma.productCategory.create({
      data: { name, normalizedName: name.toLowerCase() },
      select: { name: true },
    });
    return NextResponse.json({ category: category.name }, { status: 201 });
  } catch (error) {
    if (error?.code === "P2002") return NextResponse.json({ error: "That category already exists." }, { status: 409 });
    console.error("Admin could not create product category:", error);
    return NextResponse.json({ error: "Could not save the category." }, { status: 500 });
  }
}
