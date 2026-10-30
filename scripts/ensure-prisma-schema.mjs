import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not configured; skipping automatic Prisma schema synchronization.");
  process.exit(0);
}

const prismaCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const schemaArguments = ["prisma", "db", "push", "--schema", "prisma/schema.prisma"];
const pushResult = spawnSync(prismaCommand, schemaArguments, { stdio: "inherit", shell: false });

if (pushResult.error) {
  console.error("Could not run Prisma schema synchronization:", pushResult.error.message);
  process.exit(1);
}

if (pushResult.status !== 0) {
  console.error("Prisma schema synchronization failed. No automatic data-loss confirmation was supplied.");
  process.exit(pushResult.status ?? 1);
}

const generateResult = spawnSync(prismaCommand, ["prisma", "generate", "--schema", "prisma/schema.prisma"], {
  stdio: "inherit",
  shell: false,
});

if (generateResult.error) {
  console.error("Could not regenerate Prisma Client:", generateResult.error.message);
  process.exit(1);
}

if (generateResult.status !== 0) {
  console.error("Prisma Client generation failed.");
  process.exit(generateResult.status ?? 1);
}
