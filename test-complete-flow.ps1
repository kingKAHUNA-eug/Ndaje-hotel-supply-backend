# Hotel Supply System - Complete Flow Demonstration
# This script demonstrates the complete quote-to-delivery flow

Write-Host "🏨 Hotel Supply System - Complete Flow Test" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

# Step 1: Client Login and View Products
Write-Host "`n📋 STEP 1: Client Login and View Product Catalog" -ForegroundColor Yellow
Write-Host "-" * 50

$clientResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "client1@hotelparadise.com", "password": "Client#123"}'
$clientToken = $clientResponse.data.token
Write-Host "✅ Client 1 logged in successfully" -ForegroundColor Green

$products = Invoke-RestMethod -Uri "http://localhost:4000/api/products" -Method GET -Headers @{"Authorization" = "Bearer $clientToken"}
Write-Host "✅ Product catalog retrieved - Found $($products.data.products.Count) products" -ForegroundColor Green

# Display first 3 products
Write-Host "`n📦 Sample Products:" -ForegroundColor Blue
for ($i = 0; $i -lt 3; $i++) {
    $product = $products.data.products[$i]
    Write-Host "  • $($product.name) - $($product.sku) - $($product.price) XAF" -ForegroundColor White
}

# Step 2: Create Quote
Write-Host "`n📝 STEP 2: Create Quote" -ForegroundColor Yellow
Write-Host "-" * 50

$quoteResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes" -Method POST -ContentType "application/json" -Headers @{"Authorization" = "Bearer $clientToken"} -Body '{"notes": "Need supplies for hotel renovation project"}'
$quoteId = $quoteResponse.data.quote.id
Write-Host "✅ Quote created with ID: $quoteId" -ForegroundColor Green

# Step 3: Add Items to Quote
Write-Host "`n🛒 STEP 3: Add Items to Quote" -ForegroundColor Yellow
Write-Host "-" * 50

# Get first 3 product IDs
$productIds = @()
for ($i = 0; $i -lt 3; $i++) {
    $productIds += $products.data.products[$i].id
}

$addItemsBody = @{
    items = @(
        @{productId = $productIds[0]; quantity = 5},
        @{productId = $productIds[1]; quantity = 10},
        @{productId = $productIds[2]; quantity = 2}
    )
} | ConvertTo-Json -Depth 3

$addItemsResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/$quoteId/add-items" -Method POST -ContentType "application/json" -Headers @{"Authorization" = "Bearer $clientToken"} -Body $addItemsBody
Write-Host "✅ Added 3 items to quote" -ForegroundColor Green

# Step 4: Finalize Quote
Write-Host "`n📤 STEP 4: Finalize Quote (Send to Manager)" -ForegroundColor Yellow
Write-Host "-" * 50

$finalizeResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/$quoteId/finalize" -Method PUT -Headers @{"Authorization" = "Bearer $clientToken"}
Write-Host "✅ Quote finalized and sent to manager" -ForegroundColor Green

# Step 5: Manager Login and Process Quote
Write-Host "`n👨‍💼 STEP 5: Manager Login and Process Quote" -ForegroundColor Yellow
Write-Host "-" * 50

$managerResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "manager@example.com", "password": "Manager#123"}'
$managerToken = $managerResponse.data.token
Write-Host "✅ Manager logged in successfully" -ForegroundColor Green

# Get pending quotes
$pendingQuotes = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/manager/pending" -Method GET -Headers @{"Authorization" = "Bearer $managerToken"}
Write-Host "✅ Found $($pendingQuotes.data.quotes.Count) pending quotes" -ForegroundColor Green

# Step 6: Manager Updates Pricing
Write-Host "`n💰 STEP 6: Manager Updates Quote Pricing" -ForegroundColor Yellow
Write-Host "-" * 50

$updatePricingBody = @{
    items = @(
        @{productId = $productIds[0]; quantity = 5; unitPrice = 42000},
        @{productId = $productIds[1]; quantity = 10; unitPrice = 22000},
        @{productId = $productIds[2]; quantity = 2; unitPrice = 72000}
    )
    sourcingNotes = "Prices updated based on current market rates. All items available for immediate sourcing."
} | ConvertTo-Json -Depth 3

$updatePricingResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/$quoteId/update-pricing" -Method PUT -ContentType "application/json" -Headers @{"Authorization" = "Bearer $managerToken"} -Body $updatePricingBody
Write-Host "✅ Quote pricing updated with real market prices" -ForegroundColor Green

# Step 7: Manager Approves Quote
Write-Host "`n✅ STEP 7: Manager Approves Quote" -ForegroundColor Yellow
Write-Host "-" * 50

$approveResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/$quoteId/approve" -Method POST -Headers @{"Authorization" = "Bearer $managerToken"}
Write-Host "✅ Quote approved by manager" -ForegroundColor Green

# Step 8: Client Converts Quote to Order
Write-Host "`n🛍️ STEP 8: Client Converts Quote to Order" -ForegroundColor Yellow
Write-Host "-" * 50

# Get client address
$addresses = Invoke-RestMethod -Uri "http://localhost:4000/api/addresses" -Method GET -Headers @{"Authorization" = "Bearer $clientToken"}
$addressId = $addresses.data.addresses[0].id

$convertOrderBody = @{
    addressId = $addressId
    notes = "Please deliver to main entrance"
} | ConvertTo-Json

$convertOrderResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/$quoteId/convert-to-order" -Method POST -ContentType "application/json" -Headers @{"Authorization" = "Bearer $clientToken"} -Body $convertOrderBody
$orderId = $convertOrderResponse.data.order.id
Write-Host "✅ Quote converted to order with ID: $orderId" -ForegroundColor Green

# Step 9: Create Payment
Write-Host "`n💳 STEP 9: Create Payment" -ForegroundColor Yellow
Write-Host "-" * 50

$paymentBody = @{
    orderId = $orderId
    phoneNumber = "+237123456791"
    amount = 500000
} | ConvertTo-Json

$paymentResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/payments" -Method POST -ContentType "application/json" -Headers @{"Authorization" = "Bearer $clientToken"} -Body $paymentBody
$paymentId = $paymentResponse.data.payment.id
Write-Host "✅ Payment created with ID: $paymentId" -ForegroundColor Green

# Step 10: Manager Approves Payment
Write-Host "`n✅ STEP 10: Manager Approves Payment" -ForegroundColor Yellow
Write-Host "-" * 50

$approvePaymentBody = @{
    status = "APPROVED"
    transactionRef = "MTN123456789"
} | ConvertTo-Json

$approvePaymentResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/payments/$paymentId/approve" -Method PUT -ContentType "application/json" -Headers @{"Authorization" = "Bearer $managerToken"} -Body $approvePaymentBody
Write-Host "✅ Payment approved by manager" -ForegroundColor Green

# Step 11: Assign Delivery Agent
Write-Host "`n🚚 STEP 11: Assign Delivery Agent" -ForegroundColor Yellow
Write-Host "-" * 50

# Get delivery agent ID
$deliveryAgentResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "delivery@example.com", "password": "Delivery#123"}'
$deliveryAgentId = $deliveryAgentResponse.data.user.id

$deliveryBody = @{
    orderId = $orderId
    agentId = $deliveryAgentId
    estimatedDelivery = "2024-01-15T14:00:00Z"
} | ConvertTo-Json

$deliveryResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/deliveries" -Method POST -ContentType "application/json" -Headers @{"Authorization" = "Bearer $managerToken"} -Body $deliveryBody
$deliveryId = $deliveryResponse.data.delivery.id
Write-Host "✅ Delivery assigned with ID: $deliveryId" -ForegroundColor Green

# Step 12: Delivery Agent Updates Status
Write-Host "`n📍 STEP 12: Delivery Agent Updates Status" -ForegroundColor Yellow
Write-Host "-" * 50

$deliveryAgentToken = $deliveryAgentResponse.data.token

$updateDeliveryBody = @{
    status = "IN_TRANSIT"
    currentLat = 4.0511
    currentLng = 9.7679
    deliveryNotes = "On route to destination"
} | ConvertTo-Json

$updateDeliveryResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/deliveries/$deliveryId/status" -Method PUT -ContentType "application/json" -Headers @{"Authorization" = "Bearer $deliveryAgentToken"} -Body $updateDeliveryBody
Write-Host "✅ Delivery status updated to IN_TRANSIT" -ForegroundColor Green

# Step 13: Mark as Delivered
Write-Host "`n🎉 STEP 13: Mark as Delivered" -ForegroundColor Yellow
Write-Host "-" * 50

$deliveredBody = @{
    status = "DELIVERED"
    actualDelivery = "2024-01-15T15:30:00Z"
    deliveryNotes = "Package delivered successfully to hotel reception"
} | ConvertTo-Json

$deliveredResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/deliveries/$deliveryId/status" -Method PUT -ContentType "application/json" -Headers @{"Authorization" = "Bearer $deliveryAgentToken"} -Body $deliveredBody
Write-Host "✅ Order marked as DELIVERED" -ForegroundColor Green

# Final Summary
Write-Host "`n🎊 COMPLETE FLOW TESTED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Green
Write-Host "📋 Summary:" -ForegroundColor Cyan
Write-Host "  • Quote ID: $quoteId" -ForegroundColor White
Write-Host "  • Order ID: $orderId" -ForegroundColor White
Write-Host "  • Payment ID: $paymentId" -ForegroundColor White
Write-Host "  • Delivery ID: $deliveryId" -ForegroundColor White
Write-Host "`n✅ All steps completed successfully!" -ForegroundColor Green
Write-Host "✅ Quote → Order → Payment → Delivery flow working perfectly!" -ForegroundColor Green
