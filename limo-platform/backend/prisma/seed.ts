import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminPhone = process.env.ADMIN_WHATSAPP_PHONE || '+201000000000';
  const rawPassword = 'admin-password-123'; // In a real scenario, use env var or prompt
  
  const passwordHash = await argon2.hash(rawPassword);

  const admin = await prisma.admin.upsert({
    where: { phone: adminPhone },
    update: { passwordHash },
    create: {
      phone: adminPhone,
      passwordHash,
    },
  });

  console.log(`Admin seeded with phone: ${admin.phone} and password: ${rawPassword}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
