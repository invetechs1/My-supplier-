import { I18nManager } from 'react-native';

export type Lang = 'ar' | 'en';
export let lang: Lang = 'ar';
export const setLang = (l: Lang) => { lang = l; I18nManager.allowRTL(l === 'ar'); };

const d: Record<string, [string, string]> = {
  brand: ['مورّدي', 'My Supplier'], search: ['ابحث عن مادة بناء…', 'Search a material…'], prices: ['الأسعار', 'Prices'], rfq: ['طلبات التسعير', 'RFQs'],
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
  demo: ['حسابات تجريبية: buyer@demo.sa · supplier1@demo.sa / Demo@2026', 'Demo: buyer@demo.sa · supplier1@demo.sa / Demo@2026'], next: ['التالي', 'Next'],
};
export const t = (k: string) => (d[k] ? d[k][lang === 'ar' ? 0 : 1] : k);
export const nm = (o: { name_ar: string; name_en: string } | null | undefined) => (o ? (lang === 'ar' ? o.name_ar : o.name_en) : '');
export const money = (v: number | null | undefined, digits = 2) => v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' ' + t('sar');
