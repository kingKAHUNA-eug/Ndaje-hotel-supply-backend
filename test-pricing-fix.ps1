# Test script to verify the pricing update fix
Write-Host "Testing Manager Pricing Update Fix" -ForegroundColor Cyan
Write-Host "=" * 50

# Step 1: Client Login
Write-Host "`nSTEP 1: Client Login" -ForegroundColor Yellow
$clientBody = '{"email": "client1@hotelparadise.com", "password": "Client#123"}'
$clientResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/login" -Method POST -ContentType "application/json" -Body $clientBody
$clientToken = $clientResponse.data.token
Write-Host "Client logged in successfully" -ForegroundColor Green

# Step 2: Create Quote
Write-Host "`nSTEP 2: Create Quote" -ForegroundColor Yellow
$createQuoteBody = '{"notes": "Test quote for pricing update"}'
$createResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes" -Method POST -ContentType "application/json" -Headers @{"Authorization" = "Bearer $clientToken"} -Body $createQuoteBody
$quoteId = $createResponse.data.quote.id
Write-Host "Quote created with ID: $quoteId" -ForegroundColor Green

# Step 3: Add Items to Quote
Write-Host "`nSTEP 3: Add Items to Quote" -ForegroundColor Yellow
$addItemsBody = @{
    items = @(
        @{productId = "68f8adb1c39d04d8d777bc96"; quantity = 5},
        @{productId = "68f8770033eb9a6ddc073c3f"; quantity = 10}
    )
} | ConvertTo-Json -Depth 3

$addItemsResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/$quoteId/add-items" -Method POST -ContentType "application/json" -Headers @{"Authorization" = "Bearer $clientToken"} -Body $addItemsBody
Write-Host "Items added to quote" -ForegroundColor Green

# Step 4: Finalize Quote
Write-Host "`nSTEP 4: Finalize Quote" -ForegroundColor Yellow
$finalizeResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/$quoteId/finalize" -Method PUT -Headers @{"Authorization" = "Bearer $clientToken"}
Write-Host "Quote finalized and sent to manager" -ForegroundColor Green

# Step 5: Manager Login
Write-Host "`nSTEP 5: Manager Login" -ForegroundColor Yellow
$managerBody = '{"email": "manager@example.com", "password": "Manager#123"}'
$managerResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/login" -Method POST -ContentType "application/json" -Body $managerBody
$managerToken = $managerResponse.data.token
Write-Host "Manager logged in successfully" -ForegroundColor Green

# Step 6: Update Pricing (THE FIX WE'RE TESTING)
Write-Host "`nSTEP 6: Update Quote Pricing" -ForegroundColor Yellow
$updatePricingBody = @{
    items = @(
        @{productId = "68f8adb1c39d04d8d777bc96"; quantity = 5; unitPrice = 42000},
        @{productId = "68f8770033eb9a6ddc073c3f"; quantity = 10; unitPrice = 22000}
    )
    sourcingNotes = "Prices updated based on current market rates. All items available for immediate sourcing."
} | ConvertTo-Json -Depth 3

try {
    $updatePricingResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/quotes/$quoteId/update-pricing" -Method PUT -ContentType "application/json" -Headers @{"Authorization" = "Bearer $managerToken"} -Body $updatePricingBody
    Write-Host "Quote pricing updated successfully!" -ForegroundColor Green
    Write-Host "Total Amount: $($updatePricingResponse.data.quote.totalAmount)" -ForegroundColor Cyan
    Write-Host "Status: $($updatePricingResponse.data.quote.status)" -ForegroundColor Cyan
} catch {
    Write-Host "Pricing update failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nTest completed!" -ForegroundColor Green
