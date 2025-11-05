# Hotel Supply Backend API

A Node.js backend API for a hotel supply management system with MTN Mobile Money payment integration.

## Features

- **Authentication & Authorization**: JWT-based auth with role-based access (CLIENT, MANAGER, ADMIN)
- **Address Management**: Clients can manage delivery addresses
- **Product Catalog**: Product management with admin controls
- **Order Management**: Order creation, approval workflow, and tracking
- **Payment Integration**: MTN Mobile Money payment processing
- **Admin Analytics**: Dashboard with income analytics and product statistics

## Tech Stack

- **Node.js** with Express.js
- **MongoDB** with Prisma ORM
- **JWT** for authentication
- **bcrypt** for password hashing
- **Zod** for validation

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment setup**:
   - Copy `.env` file and update MongoDB connection string
   - Update JWT_SECRET for production
   - Configure MTN MoMo credentials

3. **Database setup**:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Start server**:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile

### Addresses (Client only)
- `GET /api/addresses` - Get user addresses
- `POST /api/addresses` - Create address
- `GET /api/addresses/:id` - Get specific address
- `PUT /api/addresses/:id` - Update address
- `DELETE /api/addresses/:id` - Delete address

### Products
- `GET /api/products` - Get all products (public)
- `GET /api/products/:id` - Get specific product (public)
- `POST /api/products` - Create product (Admin only)
- `PUT /api/products/:id` - Update product (Admin only)
- `DELETE /api/products/:id` - Delete product (Admin only)

### Orders
- `POST /api/orders` - Create order (Client)
- `GET /api/orders/my-orders` - Get client orders
- `GET /api/orders/all` - Get all orders (Manager/Admin)
- `GET /api/orders/:id` - Get specific order
- `PUT /api/orders/:id/status` - Update order status (Manager/Admin)

### Payments
- `POST /api/payments` - Create MTN MoMo payment (Client)
- `GET /api/payments/status/:orderId` - Get payment status
- `GET /api/payments/all` - Get all payments (Manager/Admin)
- `PUT /api/payments/:paymentId/approve` - Approve/reject payment (Manager/Admin)

### Admin Analytics
- `GET /api/admin/dashboard` - Dashboard statistics
- `GET /api/admin/income` - Income analytics
- `GET /api/admin/products` - Product analytics
- `GET /api/admin/users` - User management

## User Roles

- **CLIENT**: Can create orders, manage addresses, make payments
- **MANAGER**: Can approve orders, approve payments, view analytics
- **ADMIN**: Full system access, user management, analytics

## Database Schema

The system uses MongoDB with the following main entities:
- Users (with roles)
- Addresses
- Products
- Orders & OrderItems
- Payments

## Payment Integration

MTN Mobile Money integration is stubbed with the following flow:
1. Client initiates payment with phone number
2. System creates payment record
3. Manager approves payment
4. Order status updates to PAID

## Environment Variables

```env
DATABASE_URL="mongodb://localhost:27017/hotel-supply"
JWT_SECRET="your-secret-key"
PORT=4000
NODE_ENV="development"
MTN_MOMO_SUBSCRIPTION_KEY=""
MTN_MOMO_API_USER=""
MTN_MOMO_API_KEY=""
MTN_MOMO_ENV="sandbox"
```

## Health Check

- `GET /health` - Server health status

## Error Handling

All endpoints return consistent JSON responses:
```json
{
  "success": true/false,
  "message": "Description",
  "data": {},
  "errors": [] // for validation errors
}
```

