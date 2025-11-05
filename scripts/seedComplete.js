require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function ensureUser({ name, email, role, password, phone }) {
  const passwordHash = await bcrypt.hash(password, 12);
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { name, email, role, passwordHash, phone }
    });
  } else {
    user = await prisma.user.update({
      where: { email },
      data: { name, role, passwordHash, phone }
    });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { user, token, password };
}

async function ensureProduct({ name, sku, price, description, category }) {
  let product = await prisma.product.findUnique({ where: { sku } });
  if (!product) {
    product = await prisma.product.create({
      data: { name, sku, price, description, category, active: true }
    });
  } else {
    product = await prisma.product.update({
      where: { sku },
      data: { name, price, description, category, active: true }
    });
  }
  return product;
}

async function ensureAddress({ userId, label, line1, line2, city, state, postalCode, country, isDefault }) {
  let address = await prisma.address.findFirst({
    where: { userId, line1, city }
  });
  
  if (!address) {
    address = await prisma.address.create({
      data: { userId, label, line1, line2, city, state, postalCode, country, isDefault }
    });
  } else {
    address = await prisma.address.update({
      where: { id: address.id },
      data: { label, line1, line2, city, state, postalCode, country, isDefault }
    });
  }
  return address;
}

async function main() {
  try {
    await prisma.$connect();

    console.log('🌱 Seeding complete database...\n');

    // 1. Create Users
    console.log('👥 Creating users...');
    
    const admin = await ensureUser({
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'ADMIN',
      password: 'Admin#123',
      phone: '+237123456789'
    });

    const manager = await ensureUser({
      name: 'Manager User',
      email: 'manager@example.com',
      role: 'MANAGER',
      password: 'Manager#123',
      phone: '+237123456790'
    });

    const client1 = await ensureUser({
      name: 'Hotel Paradise Client',
      email: 'client1@hotelparadise.com',
      role: 'CLIENT',
      password: 'Client#123',
      phone: '+237123456791'
    });

    const client2 = await ensureUser({
      name: 'Resort Elite Client',
      email: 'client2@resortelite.com',
      role: 'CLIENT',
      password: 'Client#123',
      phone: '+237123456792'
    });

    const deliveryAgent = await ensureUser({
      name: 'Delivery Agent',
      email: 'delivery@example.com',
      role: 'DELIVERY_AGENT',
      password: 'Delivery#123',
      phone: '+237123456793'
    });

    console.log('✅ Users created successfully\n');

    // 2. Create Addresses for Clients
    console.log('📍 Creating addresses...');
    
    const client1Address = await ensureAddress({
      userId: client1.user.id,
      label: 'Main Hotel Address',
      line1: '123 Paradise Street',
      line2: 'Hotel Paradise Complex',
      city: 'Douala',
      state: 'Littoral',
      postalCode: '00237',
      country: 'Cameroon',
      isDefault: true
    });

    const client2Address = await ensureAddress({
      userId: client2.user.id,
      label: 'Resort Main Office',
      line1: '456 Elite Boulevard',
      line2: 'Resort Elite Campus',
      city: 'Yaoundé',
      state: 'Centre',
      postalCode: '00237',
      country: 'Cameroon',
      isDefault: true
    });

    console.log('✅ Addresses created successfully\n');

    // 3. Create Product Catalog
    console.log('📦 Creating product catalog...');
    
    const products = [
      {
        name: 'Premium Bed Sheets Set',
        sku: 'BED-SHEET-PREM-001',
        price: 45000, // Reference price in XAF
        description: 'High-quality cotton bed sheets set (King size)',
        category: 'Bedding'
      },
      {
        name: 'Hotel Towel Set',
        sku: 'TOWEL-SET-HOTEL-001',
        price: 25000,
        description: 'Complete towel set for hotel rooms (4 pieces)',
        category: 'Bathroom'
      },
      {
        name: 'Restaurant Dinner Plates',
        sku: 'PLATE-DINNER-REST-001',
        price: 15000,
        description: 'Fine china dinner plates (set of 12)',
        category: 'Restaurant'
      },
      {
        name: 'Hotel Soap Dispenser',
        sku: 'SOAP-DISP-HOTEL-001',
        price: 8000,
        description: 'Automatic soap dispenser for hotel bathrooms',
        category: 'Bathroom'
      },
      {
        name: 'Conference Room Chairs',
        sku: 'CHAIR-CONF-001',
        price: 75000,
        description: 'Ergonomic conference room chairs (set of 10)',
        category: 'Furniture'
      },
      {
        name: 'Hotel Mini Bar Refrigerator',
        sku: 'FRIDGE-MINIBAR-001',
        price: 120000,
        description: 'Compact mini bar refrigerator for hotel rooms',
        category: 'Appliances'
      },
      {
        name: 'Restaurant Coffee Maker',
        sku: 'COFFEE-MAKER-REST-001',
        price: 85000,
        description: 'Commercial coffee maker for restaurant service',
        category: 'Restaurant'
      },
      {
        name: 'Hotel Room Safe',
        sku: 'SAFE-HOTEL-ROOM-001',
        price: 95000,
        description: 'Electronic room safe for guest valuables',
        category: 'Security'
      },
      {
        name: 'Pool Towels',
        sku: 'TOWEL-POOL-001',
        price: 12000,
        description: 'Quick-dry pool towels (set of 6)',
        category: 'Pool'
      },
      {
        name: 'Hotel Desk Lamp',
        sku: 'LAMP-DESK-HOTEL-001',
        price: 18000,
        description: 'Modern LED desk lamp for hotel rooms',
        category: 'Lighting'
      }
    ];

    const createdProducts = [];
    for (const productData of products) {
      const product = await ensureProduct(productData);
      createdProducts.push(product);
    }

    console.log('✅ Product catalog created successfully\n');

    // 4. Display Summary
    console.log('🎉 Database seeding completed successfully!\n');
    console.log('='.repeat(60));
    console.log('📋 TESTING CREDENTIALS');
    console.log('='.repeat(60));
    
    console.log('\n🔑 ADMIN');
    console.log(`Email: ${admin.user.email}`);
    console.log(`Password: ${admin.password}`);
    console.log(`Token: ${admin.token}`);
    
    console.log('\n👨‍💼 MANAGER');
    console.log(`Email: ${manager.user.email}`);
    console.log(`Password: ${manager.password}`);
    console.log(`Token: ${manager.token}`);
    
    console.log('\n🏨 CLIENT 1 (Hotel Paradise)');
    console.log(`Email: ${client1.user.email}`);
    console.log(`Password: ${client1.password}`);
    console.log(`Token: ${client1.token}`);
    
    console.log('\n🏨 CLIENT 2 (Resort Elite)');
    console.log(`Email: ${client2.user.email}`);
    console.log(`Password: ${client2.password}`);
    console.log(`Token: ${client2.token}`);
    
    console.log('\n🚚 DELIVERY AGENT');
    console.log(`Email: ${deliveryAgent.user.email}`);
    console.log(`Password: ${deliveryAgent.password}`);
    console.log(`Token: ${deliveryAgent.token}`);
    
    console.log('\n📦 PRODUCT CATALOG');
    console.log(`Total Products: ${createdProducts.length}`);
    console.log('Categories: Bedding, Bathroom, Restaurant, Furniture, Appliances, Security, Pool, Lighting');
    
    console.log('\n📍 ADDRESSES');
    console.log(`Client 1 Address: ${client1Address.line1}, ${client1Address.city}`);
    console.log(`Client 2 Address: ${client2Address.line1}, ${client2Address.city}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('🚀 Ready for testing! Use these credentials to test the complete flow.');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
