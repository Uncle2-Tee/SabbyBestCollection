import { PrismaClient } from "@prisma/client";
import {
  defaultProductCaution,
  defaultProductUsage,
  initialProducts,
} from "../src/lib/catalog.js";
import { productToDatabaseRow } from "../src/lib/products.js";

const prisma = new PrismaClient();
const retiredStarterProductIds = [
  "velvet-glow",
  "cloud-cream",
  "soft-focus",
  "ritual-oil",
  "clear-day",
  "silk-lip",
];

try {
  const removed = await prisma.product.deleteMany({
    where: { id: { in: retiredStarterProductIds } },
  });
  const result = await prisma.product.createMany({
    data: initialProducts.map((product, sortOrder) => productToDatabaseRow({
      ...product,
      cardDescription: product.description,
      howToUse: defaultProductUsage,
      caution: defaultProductCaution,
      sortOrder,
    })),
    skipDuplicates: true,
  });
  console.log(`Removed ${removed.count} retired sample products and added ${result.count} new starter products; other products were left unchanged.`);
} finally {
  await prisma.$disconnect();
}
