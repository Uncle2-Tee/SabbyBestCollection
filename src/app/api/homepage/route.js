import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { defaultHomepageImages } from "../../../lib/homepage-images";

export const runtime = "nodejs";

const transientDatabaseErrorCodes = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2028"]);
const settingsQueryRetryDelays = [250, 500, 1000];

function isTransientDatabaseError(error) {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return transientDatabaseErrorCodes.has(code)
    || (error?.name === "PrismaClientInitializationError" && /Can't reach database server/i.test(error.message || ""));
}

async function findHomepageSettingsWithRetry() {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.homepageSettings.findUnique({ where: { id: "homepage" } });
    } catch (error) {
      const retryDelay = settingsQueryRetryDelays[attempt];
      if (!isTransientDatabaseError(error) || retryDelay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "development") {
      return NextResponse.json({ images: defaultHomepageImages });
    }

    return NextResponse.json({ error: "The PostgreSQL database is not configured." }, { status: 503 });
  }

  try {
    const settings = await findHomepageSettingsWithRetry();
    return NextResponse.json({
      images: settings ? {
        heroEditorial: settings.heroEditorial,
        heroLookbook: settings.heroLookbook,
        heroDetail: settings.heroDetail,
        heroShoe: settings.heroShoe || defaultHomepageImages.heroShoe,
      } : defaultHomepageImages,
    });
  } catch (error) {
    console.error("Could not read homepage images:", error);
    if (process.env.NODE_ENV === "development" && isTransientDatabaseError(error)) {
      console.warn("Using the default homepage images while PostgreSQL is unavailable.");
      return NextResponse.json({ images: defaultHomepageImages });
    }
    return NextResponse.json({ error: "Could not load homepage images." }, { status: 503 });
  }
}
