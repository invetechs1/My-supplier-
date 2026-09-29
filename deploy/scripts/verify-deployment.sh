#!/usr/bin/env bash
# Verifies a live MySupplier deployment from the outside (no server access needed).
#
#   WEB=https://mysupplier.sa API=https://api.mysupplier.sa bash deploy/scripts/verify-deployment.sh
#   Optional: ADMIN_EMAIL=… ADMIN_PASSWORD=… to also check the admin API and platform settings.
#
# Prints PASS / WARN / FAIL per check and exits non-zero when any check fails.
set -u
WEB="${WEB:-http://localhost:3000}"
API="${API:-http://localhost:4000}"
API_BASE="$API/api/v1"
pass=0; warn=0; fail=0
ok()   { pass=$((pass+1)); printf "  PASS  %s\n" "$1"; }
wr()   { warn=$((warn+1)); printf "  WARN  %s\n" "$1"; }
bad()  { fail=$((fail+1)); printf "  FAIL  %s\n" "$1"; }
code() { curl -sk -o /dev/null -w "%{http_code}" --max-time 20 "$@"; }
body() { curl -sk --max-time 20 "$@"; }
hdr()  { curl -skI --max-time 20 "$1" | tr -d '\r' | grep -i "^$2:" | head -1; }
num()  { python3 -c "import sys,json,re
d=json.load(sys.stdin)
for k in sys.argv[1].split('.'):
    d=d[int(k)] if isinstance(d,list) else d.get(k)
print(d if d is not None else '')" "$1" 2>/dev/null; }

echo "MySupplier deployment verification"; echo "  WEB=$WEB"; echo "  API=$API"; echo

echo "1. API"
h=$(body "$API_BASE/health")
[ "$(echo "$h" | num ok)" = "True" ] && ok "health ok=true" || bad "health endpoint ($API_BASE/health) did not return ok:true → API not running or not reachable through the proxy"
[ "$(echo "$h" | num db)" = "up" ] && ok "database reachable from the API" || bad "health.db is not 'up' → DATABASE_URL / migrations / db container"
v=$(echo "$h" | num version); [ -n "$v" ] && ok "API version $v" || wr "no version in health"
[ "$(code "$API/")" = "200" ] && ok "API root answers" || wr "API root ($API/) not 200"
cats=$(body "$API_BASE/categories" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
[ "${cats:-0}" -ge 60 ] && ok "$cats categories (catalogue seeded)" || { [ "${cats:-0}" -gt 0 ] && wr "$cats categories only (expected 62 with the standard catalogue)" || bad "no categories → seed not run (pnpm --filter @mysupplier/api prisma:seed or deploy/scripts/seed-demo.sh)"; }
prods=$(body "$API_BASE/shop/products?pageSize=1" | num total); [ "${prods:-0}" -gt 0 ] && ok "$prods products in the shop" || bad "shop has 0 products"
sups=$(body "$API_BASE/suppliers" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else d.get('total',0))" 2>/dev/null || echo 0); [ "${sups:-0}" -gt 0 ] && ok "$sups suppliers listed" || wr "no suppliers listed yet"
[ "$(code "$API_BASE/shop/home")" = "200" ] && ok "shop home (deals, featured, categories)" || bad "shop/home not 200"
[ "$(code "$API_BASE/shop/suggest?q=cem")" = "200" ] && ok "search suggestions" || bad "shop/suggest not 200"
[ "$(code "$API_BASE/shop/brands")" = "200" ] && ok "brands" || bad "shop/brands not 200"
[ "$(code "$API_BASE/shipping/carriers")" = "200" ] && ok "carriers / shipping rate cards" || bad "shipping/carriers not 200"
[ "$(code "$API_BASE/images/materials/CEM-OPC-50")" = "200" ] && ok "generated product images" || wr "generated image route not 200 (fine if SKU CEM-OPC-50 does not exist in your catalogue)"
[ "$(code -X POST -H 'Content-Type: application/json' -d '{"city":"Riyadh","text":"Rebar 16mm, 10, ton"}' "$API_BASE/boq/analyze")" = "200" ] && ok "BOQ analysis" || bad "boq/analyze not 200"
[ "$(code "$API_BASE/admin/stats")" = "401" ] && ok "admin routes require a token" || bad "admin/stats without token did not return 401"
[ "$(code "$API_BASE/orders")" = "401" ] && ok "buyer routes require a token" || bad "orders without token did not return 401"
[ "$(code -H "X-Api-Key: msk_live_invalid" "$API_BASE/integrations/v1/ping")" = "401" ] && ok "ERP key auth rejects an invalid key" || bad "integrations ping with a bad key did not return 401"
acao=$(curl -sk -o /dev/null -w "%{http_code}" -X OPTIONS -H "Origin: $WEB" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type" "$API_BASE/auth/login")
[ "$acao" = "204" ] || [ "$acao" = "200" ] && ok "CORS preflight from $WEB accepted" || bad "CORS preflight from $WEB returned $acao → CORS_ORIGIN must be exactly $WEB"
[ -n "$(hdr "$API_BASE/health" x-content-type-options)" ] && ok "helmet security headers on the API" || wr "no X-Content-Type-Options header on the API"
[ -n "$(hdr "$API_BASE/health" strict-transport-security)" ] && ok "HSTS on the API domain" || wr "no HSTS on the API domain (Caddy adds it only when TLS is active)"
case "$API" in https://*) ok "API served over HTTPS";; *) wr "API is not HTTPS";; esac

echo; echo "2. Web"
home=$(body "$WEB/")
[ "$(code "$WEB/")" = "200" ] && ok "home page 200" || bad "home page not 200"
echo "$home" | grep -q "Build for less" && ok "brand tagline present" || bad "home page does not contain the brand tagline → wrong build or wrong service behind the domain"
apihost=$(echo "$API" | sed -E 's#https?://##')
csp=$(hdr "$WEB/" content-security-policy)
[ -n "$csp" ] && ok "Content-Security-Policy header present" || bad "no CSP header → next.config.mjs headers not active"
echo "$csp" | grep -q "$apihost" && ok "web build points at $apihost (NEXT_PUBLIC_API_URL baked in)" || bad "CSP connect-src does not include $apihost → web was built with the wrong NEXT_PUBLIC_API_URL; rebuild the web image"
[ -n "$(hdr "$WEB/" strict-transport-security)" ] && ok "HSTS on the web domain" || wr "no HSTS on the web domain"
[ -n "$(hdr "$WEB/" x-frame-options)" ] && ok "X-Frame-Options" || wr "no X-Frame-Options"
for p in /shop /materials /brands /suppliers /compare /boq /login /register /help /about /contact /terms /privacy /refund-policy /dashboard /supplier /admin; do
  c=$(code "$WEB$p"); [ "$c" = "200" ] && ok "page $p" || bad "page $p returned $c"
done
for p in /robots.txt /sitemap.xml /manifest.webmanifest /favicon.svg /og-image.png; do
  c=$(code "$WEB$p"); [ "$c" = "200" ] && ok "asset $p" || wr "asset $p returned $c"
done
www=$(code -L "$(echo "$WEB" | sed -E 's#https?://#https://www.#')"); [ "$www" = "200" ] && ok "www redirect works" || wr "www.<domain> returned $www (DNS for www or Caddy redirect missing)"

echo; echo "3. Admin (optional, needs ADMIN_EMAIL / ADMIN_PASSWORD)"
if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  tok=$(body -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" "$API_BASE/auth/login" | num token)
  if [ -n "$tok" ]; then
    ok "admin login"
    s=$(body -H "Authorization: Bearer $tok" "$API_BASE/admin/settings")
    ok "platform settings: commission $(echo "$s" | num commissionPct)% · payout day $(echo "$s" | num payoutDayOfWeek) · low-stock default $(echo "$s" | num lowStockThresholdDefault)"
    [ "$(code -H "Authorization: Bearer $tok" "$API_BASE/admin/stats")" = "200" ] && ok "admin stats" || bad "admin/stats failed with a valid token"
    [ "$(code -H "Authorization: Bearer $tok" "$API_BASE/admin/reports")" = "200" ] && ok "admin reports" || wr "admin/reports not 200"
    [ "$(code -H "Authorization: Bearer $tok" "$API_BASE/admin/audit")" = "200" ] && ok "audit log" || wr "admin/audit not 200"
    demo=$(body -X POST -H 'Content-Type: application/json' -d '{"email":"admin@mysupplier.sa","password":"Admin123!"}' "$API_BASE/auth/login" | num token)
    [ -z "$demo" ] && ok "demo admin account (admin@mysupplier.sa / Admin123!) is NOT usable" || bad "demo admin account still logs in with the seed password → change or delete it before launch"
  else
    bad "admin login failed for $ADMIN_EMAIL"
  fi
else
  wr "skipped (set ADMIN_EMAIL and ADMIN_PASSWORD to check settings, reports and the demo-account lockout)"
fi

echo; printf "Summary: %d passed, %d warnings, %d failed\n" "$pass" "$warn" "$fail"
[ "$fail" -eq 0 ]
