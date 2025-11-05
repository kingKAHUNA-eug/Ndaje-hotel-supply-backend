# Hotel Supply Backend - Quote-Based Ordering System

## Overview

This backend implements a quote-based ordering system for hotel supply management without dedicated inventory. The system follows a 6-step process from order request to delivery completion.

## System Architecture

### Core Flow

1. **Digital List Request (Client)** → Order with `PENDING_QUOTE` status
2. **Manager Quote Generation** → Quote created with manager-set prices
3. **Quote Approval & Location Confirmation (Client)** → Order status: `AWAITING_PAYMENT`
4. **Payment Processing (MTN MoMo)** → Order status: `PAID_AND_APPROVED`
5. **Delivery Assignment** → Order status: `IN_TRANSIT`
6. **Delivery Completion** → Order status: `DELIVERED`

### User Roles

- **CLIENT**: Places orders, approves quotes, makes payments, tracks deliveries
- **MANAGER**: Creates quotes, approves payments, assigns deliveries
- **ADMIN**: Full system access, manages all operations
- **DELIVERY_AGENT**: Updates delivery status, tracks location

## Database Schema

### Key Models

#### Order
```prisma
model Order {
  id           String      @id @default(auto()) @map("_id") @db.ObjectId
  status       OrderStatus @default(PENDING_QUOTE)
  total        Float       @default(0)
  notes        String?
  
  // Relations
  client       User        @relation("ClientOrders")
  manager      User?       @relation("ManagerOrders")
  address      Address
  items        OrderItem[]
  payment      Payment?
  quote        Quote?
  delivery     Delivery?
}
```

#### Quote
```prisma
model Quote {
  id            String      @id @default(auto()) @map("_id") @db.ObjectId
  status        QuoteStatus @default(GENERATED)
  totalAmount   Float
  sourcingNotes String?
  validUntil    DateTime?
  
  // Relations
  order         Order       @relation
  manager       User        @relation("ManagerQuotes")
  items         QuoteItem[]
}
```

#### QuoteItem
```prisma
model QuoteItem {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  quantity   Int
  unitPrice  Float    // Manager-set price
  subtotal   Float
  
  // Relations
  quote      Quote    @relation
  product    Product  @relation
}
```

#### Delivery
```prisma
model Delivery {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  status        String   @default("ASSIGNED")
  currentLat    Float?
  currentLng    Float?
  estimatedDelivery DateTime?
  actualDelivery DateTime?
  
  // Relations
  order         Order    @relation
  agent         User     @relation("DeliveryAgent")
}
```

## API Endpoints

### Quote Management

#### Create Quote (Manager)
```http
POST /api/quotes
Authorization: Bearer <manager_token>
Content-Type: application/json

{
  "orderId": "order_id",
  "quoteItems": [
    {
      "productId": "product_id",
      "quantity": 10,
      "unitPrice": 25.50
    }
  ],
  "sourcingNotes": "Sourced from local supplier"
}
```

#### Approve Quote (Client)
```http
POST /api/quotes/approve
Authorization: Bearer <client_token>
Content-Type: application/json

{
  "orderId": "order_id"
}
```

#### Get Quote by Order ID
```http
GET /api/quotes/order/{orderId}
Authorization: Bearer <token>
```

### Payment Processing

#### Create Payment (Client)
```http
POST /api/payments
Authorization: Bearer <client_token>
Content-Type: application/json

{
  "orderId": "order_id",
  "phoneNumber": "256700123456"
}
```

#### Check Payment Status
```http
GET /api/payments/check/{orderId}
Authorization: Bearer <client_token>
```

#### MTN Webhook
```http
POST /api/payments/webhook/mtn
Content-Type: application/json

{
  "referenceId": "transaction_ref",
  "status": "SUCCESSFUL",
  "amount": "100.00",
  "currency": "UGX",
  "financialTransactionId": "ft_id"
}
```

### Delivery Management

#### Assign Delivery Agent (Manager/Admin)
```http
POST /api/deliveries/assign
Authorization: Bearer <manager_token>
Content-Type: application/json

{
  "orderId": "order_id",
  "agentId": "agent_id"
}
```

#### Update Delivery Status (Delivery Agent)
```http
PUT /api/deliveries/{deliveryId}/status
Authorization: Bearer <agent_token>
Content-Type: application/json

{
  "status": "IN_TRANSIT",
  "location": {
    "latitude": 0.3476,
    "longitude": 32.5825
  },
  "notes": "On the way to delivery location"
}
```

#### Track Delivery (Client)
```http
GET /api/deliveries/tracking/{orderId}
Authorization: Bearer <client_token>
```

## Services

### QuoteService
- `createQuote(orderId, managerId, quoteItems, sourcingNotes)`
- `approveQuote(orderId, clientId)`
- `rejectQuote(orderId, clientId, reason)`
- `getQuoteByOrderId(orderId)`

### DeliveryService
- `assignDeliveryAgent(orderId, agentId)`
- `updateDeliveryStatus(deliveryId, agentId, status, location, notes)`
- `getDeliveryTracking(orderId, clientId)`

### MTNPaymentService
- `requestPayment(phoneNumber, amount, externalId, payeeNote, payerMessage)`
- `getPaymentStatus(referenceId)`
- `validateWebhookSignature(payload, signature)`

### GeocodingService
- `geocodeAddress(address)`
- `reverseGeocode(latitude, longitude)`
- `calculateDistance(lat1, lon1, lat2, lon2)`

## Environment Variables

```env
# Database
DATABASE_URL="mongodb://localhost:27017/hotel-supply"

# JWT
JWT_SECRET="your_jwt_secret"

# MTN MoMo API
MTN_MOMO_BASE_URL="https://sandbox.momodeveloper.mtn.com"
MTN_MOMO_API_KEY="your_api_key"
MTN_MOMO_API_SECRET="your_api_secret"
MTN_MOMO_SUBSCRIPTION_KEY="your_subscription_key"
MTN_MOMO_ENVIRONMENT="sandbox"

# Server
PORT=4000
NODE_ENV="development




//Analyze current backend structure and identify missing components
Update Prisma schema to support quote-based ordering with new models
Add DELIVERY_AGENT role and update user model
Create Quote model for manager pricing
Update order statuses to match quote-based flow
Create QuoteService for quote generation and management
Create QuoteController for quote operations
Create quote routes with proper RBAC
Update PaymentController for MTN API integration
Create DeliveryService for tracking and management
Add geocoding and location verification
Update auth middleware for new roles