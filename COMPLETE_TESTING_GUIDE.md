# 🏨 Hotel Supply System - Complete Testing Guide

## 🎯 System Overview

This is a **quote-based hotel supply system** with the following key characteristics:
- **No Inventory System**: Products are sourced on-demand
- **Reference Pricing**: Product prices are for reference only
- **Quote-Based Flow**: Clients create quotes → Managers price → Orders created
- **Payment Integration**: MTN Mobile Money integration
- **Role-Based Access**: Admin, Manager, Client, Delivery Agent

## 🚀 Quick Start

### 1. Start the Server
```bash
npm run dev
```
Server runs on: `http://localhost:4000`

### 2. Database Setup
```bash
# Database is already seeded with:
# - 1 Admin, 1 Manager, 2 Clients, 1 Delivery Agent
# - 10 Products across 8 categories
# - 2 Client addresses
```

## 👥 Test Users & Credentials

| Role | Email | Password | Purpose |
|------|-------|----------|---------|
| **ADMIN** | admin@example.com | Admin#123 | Full system access |
| **MANAGER** | manager@example.com | Manager#123 | Quote pricing & approval |
| **CLIENT 1** | client1@hotelparadise.com | Client#123 | Hotel Paradise |
| **CLIENT 2** | client2@resortelite.com | Client#123 | Resort Elite |
| **DELIVERY** | delivery@example.com | Delivery#123 | Delivery management |

## 📋 Complete Testing Flow

### Phase 1: Product Catalog Setup (Admin/Manager)

#### 1.1 Login as Admin
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "Admin#123"}'
```

#### 1.2 View Product Catalog
```bash
curl -X GET http://localhost:4000/api/products \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

#### 1.3 Add New Product (Optional)
```bash
curl -X POST http://localhost:4000/api/products \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Luxury Bathrobes",
    "sku": "BATHROBE-LUX-001",
    "price": 35000,
    "description": "Premium cotton bathrobes for hotel guests",
    "category": "Bathroom"
  }'
```

### Phase 2: Client Quote Creation

#### 2.1 Login as Client 1
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "client1@hotelparadise.com", "password": "Client#123"}'
```

#### 2.2 Create Empty Quote
```bash
curl -X POST http://localhost:4000/api/quotes \
  -H "Authorization: Bearer YOUR_CLIENT1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Need supplies for hotel renovation project"
  }'
```

#### 2.3 Add Items to Quote
```bash
curl -X POST http://localhost:4000/api/quotes/QUOTE_ID/add-items \
  -H "Authorization: Bearer YOUR_CLIENT1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"productId": "PRODUCT_ID_1", "quantity": 5},
      {"productId": "PRODUCT_ID_2", "quantity": 10},
      {"productId": "PRODUCT_ID_3", "quantity": 2}
    ]
  }'
```

#### 2.4 Finalize Quote (Send to Manager)
```bash
curl -X PUT http://localhost:4000/api/quotes/QUOTE_ID/finalize \
  -H "Authorization: Bearer YOUR_CLIENT1_TOKEN"
```

### Phase 3: Manager Quote Processing

#### 3.1 Login as Manager
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "manager@example.com", "password": "Manager#123"}'
```

#### 3.2 View Pending Quotes
```bash
curl -X GET http://localhost:4000/api/quotes/manager/pending \
  -H "Authorization: Bearer YOUR_MANAGER_TOKEN"
```

#### 3.3 Update Quote with Real Prices
```bash
curl -X PUT http://localhost:4000/api/quotes/QUOTE_ID/update-pricing \
  -H "Authorization: Bearer YOUR_MANAGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"productId": "PRODUCT_ID_1", "quantity": 5, "unitPrice": 42000},
      {"productId": "PRODUCT_ID_2", "quantity": 10, "unitPrice": 22000},
      {"productId": "PRODUCT_ID_3", "quantity": 2, "unitPrice": 72000}
    ],
    "sourcingNotes": "Prices updated based on current market rates. All items available for immediate sourcing."
  }'
```

#### 3.4 Approve Quote
```bash
curl -X POST http://localhost:4000/api/quotes/QUOTE_ID/approve \
  -H "Authorization: Bearer YOUR_MANAGER_TOKEN"
```

### Phase 4: Order Creation & Payment

#### 4.1 Client Converts Quote to Order
```bash
curl -X POST http://localhost:4000/api/quotes/QUOTE_ID/convert-to-order \
  -H "Authorization: Bearer YOUR_CLIENT1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "addressId": "ADDRESS_ID",
    "notes": "Please deliver to main entrance"
  }'
```

#### 4.2 Create Payment
```bash
curl -X POST http://localhost:4000/api/payments \
  -H "Authorization: Bearer YOUR_CLIENT1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER_ID",
    "phoneNumber": "+237123456791",
    "amount": 500000
  }'
```

#### 4.3 Manager Approves Payment
```bash
curl -X PUT http://localhost:4000/api/payments/PAYMENT_ID/approve \
  -H "Authorization: Bearer YOUR_MANAGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "APPROVED",
    "transactionRef": "MTN123456789"
  }'
```

### Phase 5: Delivery Management

#### 5.1 Manager Assigns Delivery Agent
```bash
curl -X POST http://localhost:4000/api/deliveries \
  -H "Authorization: Bearer YOUR_MANAGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER_ID",
    "agentId": "DELIVERY_AGENT_ID",
    "estimatedDelivery": "2024-01-15T14:00:00Z"
  }'
```

#### 5.2 Delivery Agent Updates Status
```bash
# Login as Delivery Agent
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "delivery@example.com", "password": "Delivery#123"}'

# Update delivery status
curl -X PUT http://localhost:4000/api/deliveries/DELIVERY_ID/status \
  -H "Authorization: Bearer YOUR_DELIVERY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "IN_TRANSIT",
    "currentLat": 4.0511,
    "currentLng": 9.7679,
    "deliveryNotes": "On route to destination"
  }'
```

#### 5.3 Mark as Delivered
```bash
curl -X PUT http://localhost:4000/api/deliveries/DELIVERY_ID/status \
  -H "Authorization: Bearer YOUR_DELIVERY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "DELIVERED",
    "actualDelivery": "2024-01-15T15:30:00Z",
    "deliveryNotes": "Package delivered successfully to hotel reception"
  }'
```

## 🔄 Alternative Testing Scenarios

### Scenario A: Quote Rejection
1. Client creates quote
2. Manager rejects quote with reason
3. Client can modify and resubmit

### Scenario B: Multiple Quotes
1. Client 2 creates different quote
2. Manager processes both quotes simultaneously
3. Different pricing strategies

### Scenario C: Payment Failure
1. Client initiates payment
2. Manager rejects payment
3. Client retries with different method

## 📊 Monitoring & Analytics

### Admin Dashboard
```bash
curl -X GET http://localhost:4000/api/admin/dashboard \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Order Analytics
```bash
curl -X GET http://localhost:4000/api/admin/orders \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Income Analytics
```bash
curl -X GET http://localhost:4000/api/admin/income \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## 🛠️ Testing Tools

### Using Postman
1. Import the API collection
2. Set environment variables for tokens
3. Run the complete flow

### Using curl (Command Line)
Use the curl commands provided above

### Using Prisma Studio
```bash
npx prisma studio
```
Access at: `http://localhost:5555`

## 📝 Expected Results

### Quote Status Flow
1. `PENDING_ITEMS` → Client adding items
2. `PENDING_PRICING` → Manager pricing
3. `AWAITING_CLIENT_APPROVAL` → Client review
4. `APPROVED` → Ready for order conversion
5. `CONVERTED_TO_ORDER` → Order created

### Order Status Flow
1. `PENDING_QUOTE` → Initial state
2. `AWAITING_PAYMENT` → Payment required
3. `PAID_AND_APPROVED` → Payment confirmed
4. `IN_TRANSIT` → Delivery in progress
5. `DELIVERED` → Completed

### Payment Status Flow
1. `PENDING` → Payment initiated
2. `APPROVED` → Manager approved
3. `CONFIRMED` → Payment confirmed

## 🚨 Common Issues & Solutions

### Issue: "Quote not found"
**Solution**: Use correct quote ID from previous step

### Issue: "Insufficient permissions"
**Solution**: Ensure correct role token is used

### Issue: "Product not found"
**Solution**: Check product IDs from catalog

### Issue: "Address not found"
**Solution**: Use correct address ID for client

## 🎯 Success Criteria

✅ **Complete Flow Tested**:
- [ ] Admin creates product catalog
- [ ] Client creates quote with items
- [ ] Manager prices and approves quote
- [ ] Client converts quote to order
- [ ] Payment processed and approved
- [ ] Delivery assigned and completed
- [ ] All statuses updated correctly

✅ **Data Integrity**:
- [ ] All relationships maintained
- [ ] Status transitions valid
- [ ] No orphaned records
- [ ] Proper role-based access

✅ **Business Logic**:
- [ ] Quote pricing reflects market rates
- [ ] Payment approval workflow
- [ ] Delivery tracking functional
- [ ] Analytics data accurate

## 🔗 API Endpoints Summary

| Method | Endpoint | Role | Purpose |
|--------|----------|------|---------|
| POST | `/api/auth/login` | All | User authentication |
| GET | `/api/products` | All | View product catalog |
| POST | `/api/products` | Admin | Create product |
| POST | `/api/quotes` | Client | Create quote |
| PUT | `/api/quotes/:id/add-items` | Client | Add items to quote |
| PUT | `/api/quotes/:id/finalize` | Client | Submit quote |
| PUT | `/api/quotes/:id/update-pricing` | Manager | Price quote |
| POST | `/api/quotes/:id/approve` | Manager | Approve quote |
| POST | `/api/quotes/:id/convert-to-order` | Client | Create order |
| POST | `/api/payments` | Client | Create payment |
| PUT | `/api/payments/:id/approve` | Manager | Approve payment |
| POST | `/api/deliveries` | Manager | Assign delivery |
| PUT | `/api/deliveries/:id/status` | Delivery | Update status |

---

**🎉 Happy Testing! This system demonstrates a complete quote-based hotel supply workflow from initial quote creation to final delivery.**
