import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.SEED_USERNAME;
  const password = process.env.SEED_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "SEED_USERNAME and SEED_PASSWORD environment variables must be set to seed the user."
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { username },
    update: { passwordHash, failedAttempts: 0, lockedUntil: null },
    create: { username, passwordHash },
  });

  console.log(`Seeded user "${user.username}" (id: ${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
