# New Quote-First Flow Guide

## Overview

This guide explains the improved quote-based ordering system designed for a **no-inventory hotel supply business**. This system solves the address and product ID dependency issues while accommodating the reality that products are sourced on-demand.

## Why Quote-First Flow is Perfect for No-Inventory Business

**Key Business Reality:** This hotel supply business operates **without inventory** - products are sourced on-demand from suppliers.

**Why Quote-First Flow Works Perfectly:**
- ✅ **No stock commitments** - Products are sourced only after client approval
- ✅ **Dynamic pricing** - Prices reflect current market conditions and sourcing costs
- ✅ **Supplier flexibility** - Managers can source from different suppliers based on availability
- ✅ **Reduced waste** - No risk of overstocking or expired inventory
- ✅ **Market responsiveness** - Prices can reflect current market conditions
- ✅ **Supplier relationships** - Builds relationships with multiple suppliers for better sourcing

## New Flow Steps

### 1. Client Login & Browse Products
```http
POST /api/auth/login
{
  "email": "client@example.com",
  "password": "password123"
}
```
**Response:** Client gets token for authenticated requests

### 2. Browse Available Products
```http
GET /api/products
Authorization: Bearer <client_token>
```
**Response:** List of available products (no commitment required)

### 3. Create Empty Quote (Start Shopping)
```http
POST /api/quotes
Authorization: Bearer <client_token>
Content-Type: application/json

{
  "notes": "Optional notes about this quote request"
}
```
**Response:** Empty quote with `PENDING_ITEMS` status

### 4. Add Items to Quote
```http
POST /api/quotes/{quoteId}/items
Authorization: Bearer <client_token>
Content-Type: application/json

{
  "items": [
    {
      "productId": "product_id_1",
      "quantity": 10
    },
    {
      "productId": "product_id_2", 
      "quantity": 5
    }
  ]
}
```
**Response:** Quote updated with items, status becomes `PENDING_PRICING`

### 5. Manager Reviews & Prices Quote
```http
PUT /api/quotes/{quoteId}/items
Authorization: Bearer <manager_token>
Content-Type: application/json

{
  "items": [
    {
      "productId": "product_id_1",
      "quantity": 10,
      "unitPrice": 25.50
    },
    {
      "productId": "product_id_2",
      "quantity": 5,
      "unitPrice": 15.00
    }
  ]
}
```
**Response:** Quote with pricing, status becomes `AWAITING_CLIENT_APPROVAL`

### 6. Client Reviews Quote & Decides
```http
GET /api/quotes/{quoteId}
Authorization: Bearer <client_token>
```
**Response:** Complete quote with pricing details

### 7. Client Approves Quote
```http
POST /api/quotes/approve
Authorization: Bearer <client_token>
Content-Type: application/json

{
  "quoteId": "quote_id"
}
```
**Response:** Quote status becomes `APPROVED`

### 8. Client Adds Address (Only When Ready)
```http
POST /api/addresses
Authorization: Bearer <client_token>
Content-Type: application/json

{
  "label": "Hotel Main Entrance",
  "line1": "123 Hotel Street",
  "city": "Kampala",
  "country": "Uganda"
}
```
**Response:** Address created with ID

### 9. Convert Quote to Order (Final Step)
```http
POST /api/quotes/convert/{quoteId}
Authorization: Bearer <client_token>
Content-Type: application/json

{
  "addressId": "address_id",
  "paymentMethod": "MTN_MOMO"
}
```
**Response:** Order created with `AWAITING_PAYMENT` status

### 10. Process Payment
```http
POST /api/payments
Authorization: Bearer <client_token>
Content-Type: application/json

{
  "orderId": "order_id",
  "phoneNumber": "256700123456"
}
```
**Response:** Payment initiated

## Key Benefits

### For Clients:
- **Browse freely** without providing address
- **See pricing** before committing to delivery location
- **No pressure** to provide address until ready to order
- **Clear pricing** before final commitment

### For Managers:
- **Better control** over pricing process
- **Clear workflow** from quote request to order
- **No wasted orders** from clients who aren't serious

### For System:
- **Cleaner data** with committed orders only
- **Better UX** with natural progression
- **Reduced abandoned** orders

## API Endpoints Summary

### Client Endpoints
- `POST /api/quotes` - Create empty quote
- `POST /api/quotes/{quoteId}/items` - Add items to quote
- `GET /api/quotes/{quoteId}` - Get quote details
- `POST /api/quotes/approve` - Approve quote
- `POST /api/quotes/reject` - Reject quote
- `POST /api/quotes/convert/{quoteId}` - Convert to order

### Manager Endpoints
- `PUT /api/quotes/{quoteId}/items` - Update pricing
- `POST /api/quotes/finalize/{quoteId}` - Finalize quote
- `GET /api/quotes` - Get all quotes (with filters)

### Shared Endpoints
- `GET /api/products` - Browse products
- `POST /api/addresses` - Manage addresses
- `POST /api/payments` - Process payments

## Status Flow

```
PENDING_ITEMS → PENDING_PRICING → AWAITING_CLIENT_APPROVAL → APPROVED → CONVERTED_TO_ORDER
```

## Error Handling

The system provides clear error messages for each step:
- Quote not found
- Quote not in correct status
- Products not available
- Address not found
- Insufficient permissions

## Frontend Integration

### Recommended Frontend Flow:
1. **Product Catalog Page** - Show products, allow adding to quote
2. **Quote Management Page** - Show current quote items, allow modifications
3. **Quote Review Page** - Show pricing, allow approval/rejection
4. **Address Selection Page** - Only shown when quote is approved
5. **Checkout Page** - Final order creation and payment

This flow ensures clients only provide address information when they're committed to the purchase.
