#!/usr/bin/env bash
# End-to-end smoke test against a running, seeded API. Usage: API_URL=http://localhost:4000/api/v1 ./scripts/smoke.sh
set -e
B=${API_URL:-http://localhost:4000/api/v1}
j() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
echo "--- health";     curl -s $B/health
echo; echo "--- stats"; curl -s $B/stats
echo; echo "--- price index (first 2)"; curl -s $B/price-index | j "[(e['category']['name'], e['avgPrice'], e['changePct30d']) for e in d[:2]]"
echo "--- search rebar"; curl -s "$B/materials?q=rebar&sort=price_asc&pageSize=3" | j "[(m['sku'], m['minPrice'], m['avgPrice'], m['supplierCount']) for m in d['data']], d['total']"
MID=$(curl -s "$B/materials?q=RBR-16" | j "d['data'][0]['id']")
echo "--- material detail"; curl -s "$B/materials/$MID" | j "d['summary'], len(d['listings']), len(d['history'])"
echo "--- login buyer"; BT=$(curl -s -X POST $B/auth/login -H 'content-type: application/json' -d '{"email":"buyer@mysupplier.sa","password":"Buyer123!"}' | j "d['token']")
echo "--- login supplier"; ST=$(curl -s -X POST $B/auth/login -H 'content-type: application/json' -d '{"email":"supplier@mysupplier.sa","password":"Supplier123!"}' | j "d['token']")
echo "--- login admin"; AT=$(curl -s -X POST $B/auth/login -H 'content-type: application/json' -d '{"email":"admin@mysupplier.sa","password":"Admin123!"}' | j "d['token']")
echo "--- create rfq"
RFQ=$(curl -s -X POST $B/rfqs -H "authorization: Bearer $BT" -H 'content-type: application/json' -d "{\"title\":\"Smoke test RFQ\",\"deliveryCity\":\"Riyadh\",\"closesAt\":\"2027-01-01T00:00:00Z\",\"items\":[{\"materialId\":\"$MID\",\"description\":\"Rebar 16mm\",\"quantity\":10,\"unit\":\"ton\"}]}")
echo "$RFQ" | j "d['reference'], d['status'], len(d['items'])"
RID=$(echo "$RFQ" | j "d['id']"); IID=$(echo "$RFQ" | j "d['items'][0]['id']")
echo "--- supplier marketplace"; curl -s "$B/marketplace/rfqs?city=Riyadh" -H "authorization: Bearer $ST" | j "d['total'], [r['reference'] for r in d['data']]"
echo "--- supplier notifications"; curl -s -D - -o /dev/null "$B/notifications" -H "authorization: Bearer $ST" | grep -i x-unread
echo "--- submit bid"
BID=$(curl -s -X POST $B/rfqs/$RID/bids -H "authorization: Bearer $ST" -H 'content-type: application/json' -d "{\"validUntil\":\"2026-12-01T00:00:00Z\",\"deliveryDays\":4,\"items\":[{\"rfqItemId\":\"$IID\",\"unitPrice\":2640}]}")
echo "$BID" | j "d['status'], d['totalPrice'], d['company']['name']"
BIDID=$(echo "$BID" | j "d['id']")
echo "--- buyer sees bids"; curl -s $B/rfqs/$RID -H "authorization: Bearer $BT" | j "d['bidCount'], d['lowestBid'], [b['totalPrice'] for b in d['bids']]"
echo "--- accept bid"; ACC=$(curl -s -X POST $B/bids/$BIDID/accept -H "authorization: Bearer $BT"); echo "$ACC" | j "d['order']['reference'], d['order']['status'], d['rfq']['status']"
OID=$(echo "$ACC" | j "d['order']['id']")
echo "--- supplier confirms order"; curl -s -X PATCH $B/orders/$OID/status -H "authorization: Bearer $ST" -H 'content-type: application/json' -d '{"status":"CONFIRMED"}' | j "d['status']"
echo "--- buyer illegal transition"; curl -s -X PATCH $B/orders/$OID/status -H "authorization: Bearer $BT" -H 'content-type: application/json' -d '{"status":"DELIVERED"}'
echo; echo "--- supplier upsert price"; curl -s -X POST $B/supplier/prices -H "authorization: Bearer $ST" -H 'content-type: application/json' -d "{\"materialId\":\"$MID\",\"price\":2599,\"city\":\"Riyadh\",\"minQty\":5,\"leadTimeDays\":2}" | j "d['price'], d['city']"
echo "--- admin stats"; curl -s $B/admin/stats -H "authorization: Bearer $AT" | j "d['orders'], d['gmv'], d['rfqsByStatus']"
echo "--- admin import"; curl -s -X POST $B/admin/prices/import -H "authorization: Bearer $AT" -H 'content-type: application/json' -d '{"sourceName":"Smoke Source","items":[{"sku":"CEM-OPC-50","price":15.9,"city":"Riyadh"},{"sku":"NOPE","price":1,"city":"Riyadh"}]}'
echo; echo "--- unauthorized"; curl -s $B/admin/stats -H "authorization: Bearer $BT"
echo; echo "--- compare"; M2=$(curl -s "$B/materials?q=CEM-OPC-50" | j "d['data'][0]['id']"); curl -s "$B/prices/compare?materialIds=$MID,$M2" | j "[(x['material']['sku'], x['summary']['min'], x['summary']['count']) for x in d]"

echo "--- boq analyze"; curl -s -X POST $B/boq/analyze -H 'content-type: application/json' -d '{"city":"Riyadh","text":"Rebar 16mm, 25, ton\n1200 bags OPC cement 50kg\nحديد تسليح 12 مم 15 طن"}' | j "d['matchedLines'], d['summary']['cheapestTotal'] > 0, d['summary']['bestSingleSupplier']['supplierName']"
echo "BOQ OK"
echo "--- shop home"; curl -s $B/shop/home | j "len(d['featured']) > 0, len(d['categories'])"
PID=$(curl -s "$B/shop/products?q=helmet" | j "d['data'][0]['id']"); LID=$(curl -s $B/shop/products/$PID | j "[o for o in d['offers'] if o['source']=='SUPPLIER'][0]['listingId']")
echo "--- cart + checkout"; curl -s -X POST $B/cart/items -H "authorization: Bearer $BT" -H 'content-type: application/json' -d "{\"listingId\":\"$LID\",\"quantity\":200}" | j "d['total'] > 0"
curl -s -X POST $B/checkout -H "authorization: Bearer $BT" -H 'content-type: application/json' -d '{"deliveryCity":"Riyadh","deliveryAddress":"Smoke street 1","contactPhone":"+966500000000","paymentMethod":"COD"}' | j "[(o['type'], o['paymentStatus']) for o in d['orders']]"
echo "SHOP OK"
