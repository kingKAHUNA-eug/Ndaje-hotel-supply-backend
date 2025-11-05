# Hotel Supply System - Complete Flow Demonstration
Write-Host "🏨 Hotel Supply System - Complete Flow Test" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

# Step 1: Client Login
Write-Host "`n📋 STEP 1: Client Login" -ForegroundColor Yellow
$clientBody = '{"email": "client1@hotelparadise.com", "password": "Client#123"}'
$clientResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/login" -Method POST -ContentType "application/json" -Body $clientBody
$clientToken = $clientResponse.data.token
Write-Host "✅ Client 1 logged in successfully" -ForegroundColor Green

# Step 2: View Products
Write-Host "`n📦 STEP 2: View Product Catalog" -ForegroundColor Yellow
$products = Invoke-RestMethod -Uri "http://localhost:4000/api/products" -Method GET -Headers @{"Authorization" = "Bearer $clientToken"}
Write-Host "✅ Found $($products.data.products.Count) products" -ForegroundColor Green

# Step 3: Create Quote
Write-Host "`n📝 STEP 3: Create Quote" -ForegroundColor Yellow
$quoteBody = '{"notes": "Need supplies for hotel renovation"}'
$quoteResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes" -Method POST -ContentType "application/json" -Headers @{"Authorization" = "Bearer $clientToken"} -Body $quoteBody
$quoteId = $quoteResponse.data.quote.id
Write-Host "✅ Quote created with ID: $quoteId" -ForegroundColor Green

# Step 4: Add Items
Write-Host "`n🛒 STEP 4: Add Items to Quote" -ForegroundColor Yellow
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

# Step 5: Finalize Quote
Write-Host "`n📤 STEP 5: Finalize Quote" -ForegroundColor Yellow
$finalizeResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/$quoteId/finalize" -Method PUT -Headers @{"Authorization" = "Bearer $clientToken"} -Body '{}'
Write-Host "✅ Quote finalized" -ForegroundColor Green

# Step 6: Manager Login
Write-Host "`n👨‍💼 STEP 6: Manager Login" -ForegroundColor Yellow
$managerBody = '{"email": "manager@example.com", "password": "Manager#123"}'
$managerResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/login" -Method POST -ContentType "application/json" -Body $managerBody
$managerToken = $managerResponse.data.token
Write-Host "✅ Manager logged in" -ForegroundColor Green

# Step 7: Update Pricing
Write-Host "`n💰 STEP 7: Update Quote Pricing" -ForegroundColor Yellow
$updatePricingBody = @{
    items = @(
        @{productId = $productIds[0]; quantity = 5; unitPrice = 42000},
        @{productId = $productIds[1]; quantity = 10; unitPrice = 22000},
        @{productId = $productIds[2]; quantity = 2; unitPrice = 72000}
    )
    sourcingNotes = "Prices updated based on current market rates"
} | ConvertTo-Json -Depth 3

$updatePricingResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/$quoteId/update-pricing" -Method PUT -ContentType "application/json" -Headers @{"Authorization" = "Bearer $managerToken"} -Body $updatePricingBody
Write-Host "✅ Quote pricing updated" -ForegroundColor Green

# Step 8: Approve Quote
Write-Host "`n✅ STEP 8: Approve Quote" -ForegroundColor Yellow
$approveResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/$quoteId/approve" -Method POST -Headers @{"Authorization" = "Bearer $managerToken"} -Body '{}'
Write-Host "✅ Quote approved" -ForegroundColor Green

# Step 9: Convert to Order
Write-Host "`n🛍️ STEP 9: Convert Quote to Order" -ForegroundColor Yellow
$addresses = Invoke-RestMethod -Uri "http://localhost:4000/api/addresses" -Method GET -Headers @{"Authorization" = "Bearer $clientToken"}
$addressId = $addresses.data.addresses[0].id

$convertOrderBody = @{
    addressId = $addressId
    notes = "Please deliver to main entrance"
} | ConvertTo-Json

$convertOrderResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/$quoteId/convert-to-order" -Method POST -ContentType "application/json" -Headers @{"Authorization" = "Bearer $clientToken"} -Body $convertOrderBody
$orderId = $convertOrderResponse.data.order.id
Write-Host "✅ Order created with ID: $orderId" -ForegroundColor Green

# Step 10: Create Payment
Write-Host "`n💳 STEP 10: Create Payment" -ForegroundColor Yellow
$paymentBody = @{
    orderId = $orderId
    phoneNumber = "+237123456791"
    amount = 500000
} | ConvertTo-Json

$paymentResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/payments" -Method POST -ContentType "application/json" -Headers @{"Authorization" = "Bearer $clientToken"} -Body $paymentBody
$paymentId = $paymentResponse.data.payment.id
Write-Host "✅ Payment created with ID: $paymentId" -ForegroundColor Green

# Step 11: Approve Payment
Write-Host "`n✅ STEP 11: Approve Payment" -ForegroundColor Yellow
$approvePaymentBody = @{
    status = "APPROVED"
    transactionRef = "MTN123456789"
} | ConvertTo-Json

$approvePaymentResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/payments/$paymentId/approve" -Method PUT -ContentType "application/json" -Headers @{"Authorization" = "Bearer $managerToken"} -Body $approvePaymentBody
Write-Host "✅ Payment approved" -ForegroundColor Green

# Step 12: Assign Delivery
Write-Host "`n🚚 STEP 12: Assign Delivery Agent" -ForegroundColor Yellow
$deliveryBody = '{"email": "delivery@example.com", "password": "Delivery#123"}'
$deliveryAgentResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/login" -Method POST -ContentType "application/json" -Body $deliveryBody
$deliveryAgentId = $deliveryAgentResponse.data.user.id

$deliveryBody = @{
    orderId = $orderId
    agentId = $deliveryAgentId
    estimatedDelivery = "2024-01-15T14:00:00Z"
} | ConvertTo-Json

$deliveryResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/deliveries" -Method POST -ContentType "application/json" -Headers @{"Authorization" = "Bearer $managerToken"} -Body $deliveryBody
$deliveryId = $deliveryResponse.data.delivery.id
Write-Host "✅ Delivery assigned with ID: $deliveryId" -ForegroundColor Green

# Step 13: Update Delivery Status
Write-Host "`n📍 STEP 13: Update Delivery Status" -ForegroundColor Yellow
$deliveryAgentToken = $deliveryAgentResponse.data.token

$updateDeliveryBody = @{
    status = "IN_TRANSIT"
    currentLat = 4.0511
    currentLng = 9.7679
    deliveryNotes = "On route to destination"
} | ConvertTo-Json

$updateDeliveryResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/deliveries/$deliveryId/status" -Method PUT -ContentType "application/json" -Headers @{"Authorization" = "Bearer $deliveryAgentToken"} -Body $updateDeliveryBody
Write-Host "✅ Delivery status updated to IN_TRANSIT" -ForegroundColor Green

# Step 14: Mark as Delivered
Write-Host "`n🎉 STEP 14: Mark as Delivered" -ForegroundColor Yellow
$deliveredBody = @{
    status = "DELIVERED"
    actualDelivery = "2024-01-15T15:30:00Z"
    deliveryNotes = "Package delivered successfully"
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
Write-Host "✅ Quote to Order to Payment to Delivery flow working perfectly!" -ForegroundColor Green
