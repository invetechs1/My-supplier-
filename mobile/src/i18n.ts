import { I18nManager } from 'react-native';

export type Lang = 'ar' | 'en';
export let lang: Lang = 'ar';
export const setLang = (l: Lang) => { lang = l; I18nManager.allowRTL(l === 'ar'); };

const d: Record<string, [string, string]> = {
  brand: ['مورّدي', 'My Supplier'], slogan: ['Build for Less', 'Build for Less'], slogan_ar: ['ابنِ بأقل تكلفة', 'Build for less'], search: ['ابحث عن مادة بناء…', 'Search a material…'], prices: ['الأسعار', 'Prices'], rfq: ['طلبات التسعير', 'RFQs'],
  orders: ['الطلبات', 'Orders'], me: ['حسابي', 'Account'], login: ['تسجيل الدخول', 'Log in'], register: ['إنشاء حساب', 'Sign up'], logout: ['تسجيل الخروج', 'Log out'],
  email: ['البريد الإلكتروني', 'Email'], password: ['كلمة المرور', 'Password'], full_name: ['الاسم', 'Full name'], company: ['الشركة', 'Company'], city: ['المدينة', 'City'],
  buyer: ['مشترٍ', 'Buyer'], supplier: ['مورّد', 'Supplier'], best_price: ['أفضل سعر', 'Best price'], avg: ['المتوسط', 'Average'], offers: ['عروض', 'offers'],
  ex_vat: ['قبل الضريبة', 'ex. VAT'], inc_vat: ['شامل الضريبة', 'inc. VAT'], min_qty: ['أقل كمية', 'Min qty'], verified: ['موثّق', 'Verified'], external: ['مرجع خارجي', 'External'],
  add_to_rfq: ['أضف لطلب التسعير', 'Add to RFQ'], added: ['أُضيف ✓', 'Added ✓'], new_rfq: ['طلب تسعير جديد', 'New RFQ'], title: ['العنوان', 'Title'], items: ['البنود', 'Items'],
  qty: ['الكمية', 'Qty'], send: ['إرسال', 'Send'], bids: ['العروض', 'Bids'], best_total: ['أفضل إجمالي', 'Best total'], award: ['ترسية', 'Award'], total: ['الإجمالي', 'Total'],
  submit_bid: ['أرسل العرض', 'Submit bid'], my_bid: ['عرضي', 'My bid'], delivery_days: ['مدة التوريد (يوم)', 'Delivery days'], unit_price: ['سعر الوحدة', 'Unit price'],
  market_ref: ['مرجع السوق', 'Market ref.'], notifications: ['الإشعارات', 'Notifications'], open_rfqs: ['طلبات مفتوحة', 'Open RFQs'], my_rfqs: ['طلباتي', 'My RFQs'],
  status: ['الحالة', 'Status'], no_data: ['لا توجد بيانات', 'Nothing here yet'], error: ['حدث خطأ', 'Error'], sar: ['ر.س', 'SAR'], categories: ['الفئات', 'Categories'],
  change_30d: ['تغيّر 30 يوماً', '30-day change'], history: ['حركة السعر 90 يوماً', '90-day price movement'], confirm: ['تأكيد', 'Confirm'], cancel: ['إلغاء', 'Cancel'],
  language: ['English', 'العربية'], dashboard: ['لوحة التحكم', 'Dashboard'], price_list: ['قائمة أسعاري', 'My price list'], all: ['الكل', 'All'], loading: ['جارٍ التحميل…', 'Loading…'],
  open: ['مفتوح', 'Open'], closed: ['مغلق', 'Closed'], awarded: ['تمت الترسية', 'Awarded'], draft: ['مسودة', 'Draft'], cancelled: ['ملغي', 'Cancelled'], submitted: ['مُرسل', 'Submitted'], rejected: ['لم يُقبل', 'Not selected'], withdrawn: ['مسحوب', 'Withdrawn'],
  pending: ['بانتظار التأكيد', 'Pending'], confirmed: ['مؤكد', 'Confirmed'], in_delivery: ['قيد التوصيل', 'In delivery'], delivered: ['تم التسليم', 'Delivered'], in_stock: ['متوفر', 'In stock'], limited: ['محدود', 'Limited'], out_of_stock: ['غير متوفر', 'Out'],
  pay_now: ['ادفع الآن', 'Pay now'], paid: ['مدفوع', 'Paid'], unpaid: ['غير مدفوع', 'Unpaid'], released: ['محوّل للمورّد', 'Released'], refunded: ['مسترد', 'Refunded'], pending_transfer: ['بانتظار التحويل', 'Awaiting transfer'], initiated: ['بدأ الدفع', 'Started'], failed: ['فشل', 'Failed'],
  choose_method: ['طريقة الدفع', 'Payment method'], mada: ['مدى', 'mada'], card: ['بطاقة', 'Card'], applepay: ['Apple Pay', 'Apple Pay'], stcpay: ['STC Pay', 'STC Pay'], bank_transfer: ['تحويل بنكي', 'Bank transfer'],
  escrow_note: ['يُحفظ المبلغ لدى المنصة ويُحوَّل للمورّد بعد التسليم', 'Held by the platform, released to the supplier after delivery'], payouts: ['التحويلات', 'Payouts'], in_escrow: ['محجوز لدى المنصة', 'In escrow'], payouts_pending: ['قيد التحويل', 'Payouts pending'],
  otp_send: ['أرسل رمز التحقق', 'Send code'], otp_code: ['رمز التحقق', 'Code'], otp_verify: ['تحقق', 'Verify'], otp_sent: ['أُرسل الرمز إلى', 'Code sent to'], phone: ['الجوال', 'Phone'], invoice: ['الفاتورة', 'Invoice'],
  push_enabled: ['إشعارات التطبيق مفعّلة', 'Push notifications enabled'], login_otp: ['دخول برمز الجوال', 'Log in with phone code'],
  rent: ['إيجار', 'Rent'], per_day: ['/ يوم', '/ day'], per_week: ['/ أسبوع', '/ week'], per_month: ['/ شهر', '/ month'], rent_from: ['إيجار من', 'Rent from'],
  cart: ['السلة', 'Cart'], add_to_cart: ['أضف للسلة', 'Add to cart'], in_cart: ['في السلة ✓', 'In cart ✓'], cart_empty: ['سلتك فارغة', 'Your cart is empty'], checkout: ['إتمام الشراء', 'Checkout'], place_order: ['تأكيد الطلب', 'Place order'], pay_all: ['ادفع الكل', 'Pay all'],
  subtotal: ['المجموع', 'Subtotal'], vat: ['الضريبة 15%', 'VAT 15%'], delivery: ['التوصيل', 'Delivery'], free_delivery: ['توصيل مجاني', 'Free delivery'], sold_by: ['يبيعه', 'Sold by'], coupon: ['كود خصم', 'Coupon'], apply: ['تطبيق', 'Apply'], discount: ['خصم', 'Discount'],
  favorites: ['المفضلة', 'Favorites'], no_favorites: ['لا توجد منتجات مفضلة', 'No favorites yet'], address: ['عنوان التوصيل', 'Delivery address'], addresses: ['العناوين', 'Addresses'], my_products: ['منتجاتي', 'My products'], available_qty: ['الكمية المتاحة', 'Available qty'],
  price: ['السعر', 'Price'], upload_image: ['صورة', 'Photo'], saved: ['تم الحفظ ✓', 'Saved ✓'], reviews: ['التقييمات', 'Reviews'], write_review: ['قيّم المنتج', 'Rate this product'], verified_purchase: ['شراء موثّق', 'Verified purchase'], no_reviews: ['لا توجد تقييمات بعد', 'No reviews yet'],
  best_sellers: ['الأكثر مبيعاً', 'Best sellers'], new_arrivals: ['وصل حديثاً', 'New arrivals'], popular: ['الأكثر مشاهدة', 'Most viewed'], top_rated: ['الأعلى تقييماً', 'Top rated'], buyer_only: ['التسوق لحسابات المشترين فقط', 'Shopping is for buyer accounts only'], reference_only: ['سعر مرجعي', 'Reference price'],
  timeline: ['تتبع الطلب', 'Tracking'], only_left: ['متبقٍ', 'left'], buy_now: ['اشترِ الآن', 'Buy now'], orders_created: ['تم إنشاء الطلبات', 'Orders created'], remove: ['إزالة', 'Remove'], clear: ['مسح', 'Clear'], login_to_checkout: ['سجّل الدخول لإتمام الشراء', 'Log in to check out'], notes: ['ملاحظات', 'Notes'],
  demo: ['حسابات تجريبية: buyer@demo.sa · supplier1@demo.sa / Demo@2026', 'Demo: buyer@demo.sa · supplier1@demo.sa / Demo@2026'], next: ['التالي', 'Next'],
};
export const t = (k: string) => (d[k] ? d[k][lang === 'ar' ? 0 : 1] : k);
export const nm = (o: { name_ar: string; name_en: string } | null | undefined) => (o ? (lang === 'ar' ? o.name_ar : o.name_en) : '');
export const money = (v: number | null | undefined, digits = 2) => v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' ' + t('sar');
