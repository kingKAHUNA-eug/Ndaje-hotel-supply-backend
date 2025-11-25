require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function ensureUser({ name, email, role, password }) {
  const passwordHash = await bcrypt.hash(password, 12);
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.User.create({
      data: { name, email, role, passwordHash }
    });
  } else {
    user = await prisma.user.update({
      where: { email },
      data: { name, role, passwordHash }
    });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { user, token, password };
}

async function main() {
  try {
    await prisma.$connect();

    const admin = await ensureUser({
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'ADMIN',
      password: 'Admin#123'
    });

    const manager = await ensureUser({
      name: 'Manager User',
      email: 'manager@example.com',
      role: 'MANAGER',
      password: 'Manager#123'
    });

    console.log('✅ Seeded users successfully');
    console.log('---');
    console.log('ADMIN');
    console.log(`email: ${admin.user.email}`);
    console.log(`password: ${admin.password}`);
    console.log(`token: ${admin.token}`);
    console.log('---');
    console.log('MANAGER');
    console.log(`email: ${manager.user.email}`);
    console.log(`password: ${manager.password}`);
    console.log(`token: ${manager.token}`);
  } catch (error) {
    console.error('Seed error:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();


