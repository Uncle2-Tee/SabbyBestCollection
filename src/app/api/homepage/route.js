import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { defaultHomepageImages } from "../../../lib/homepage-images";

export const runtime = "nodejs";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({ images: defaultHomepageImages });
    }

    return NextResponse.json({ error: "The PostgreSQL database is not configured." }, { status: 503 });
  }

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
    console.error("Could not read homepage images:", error);
    return NextResponse.json({ error: "Could not load homepage images." }, { status: 503 });
  }
}
