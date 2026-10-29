import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, hasValidAdminSession } from "../../../../lib/admin-auth";
import { prisma } from "../../../../lib/prisma";
import { defaultHomepageImages, validHomepageImages } from "../../../../lib/homepage-images";

export const runtime = "nodejs";

async function requireAdmin() {
  const cookieStore = await cookies();
  return hasValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "The PostgreSQL database is not configured." }, { status: 503 });

  try {
    const settings = await prisma.homepageSettings.findUnique({ where: { id: "homepage" } });
    return NextResponse.json({
      images: settings ? {
        heroEditorial: settings.heroEditorial,
        heroLookbook: settings.heroLookbook,
        heroDetail: settings.heroDetail,
      } : defaultHomepageImages,
    });
  } catch (error) {
    console.error("Admin could not read homepage images:", error);
    return NextResponse.json({ error: "Could not load homepage images." }, { status: 503 });
  }
}

export async function PUT(request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "The PostgreSQL database is not configured." }, { status: 503 });

  let images;
  try {
    ({ images } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid homepage image settings." }, { status: 400 });
  }
  if (!validHomepageImages(images)) {
    return NextResponse.json({ error: "Provide a valid image URL or upload an image for each homepage image." }, { status: 400 });
  }

  try {
    const settings = await prisma.homepageSettings.upsert({
      where: { id: "homepage" },
      create: {
        id: "homepage",
        heroEditorial: images.heroEditorial,
        heroLookbook: images.heroLookbook,
        heroDetail: images.heroDetail,
      },
      update: {
        heroEditorial: images.heroEditorial,
        heroLookbook: images.heroLookbook,
        heroDetail: images.heroDetail,
      },
    });
    return NextResponse.json({
      images: {
        heroEditorial: settings.heroEditorial,
        heroLookbook: settings.heroLookbook,
        heroDetail: settings.heroDetail,
      },
    });
  } catch (error) {
    console.error("Admin could not save homepage images:", error);
    return NextResponse.json({ error: "Could not save homepage images." }, { status: 500 });
  }
}
