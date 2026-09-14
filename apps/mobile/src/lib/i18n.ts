import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { I18nManager } from "react-native";

export type Locale = "en" | "ar";

const dictionary = {
  en: {
    home: "Home",
    search: "Search",
    rfqs: "RFQs",
    orders: "Orders",
    profile: "Profile",
    welcome: "Welcome",
    searchPlaceholder: "Search materials (cement, rebar, blocks...)",
    priceIndex: "Price index",
    categories: "Categories",
    recentlyUpdated: "Recently updated prices",
    login: "Log in",
    register: "Create account",
    logout: "Log out",
    requestQuotes: "Request quotes",
    myPriceList: "My price list",
    notifications: "Notifications",
    language: "Language",
    marketplace: "Open RFQs",
    myRfqs: "My RFQs",
    newRfq: "New RFQ",
    suppliers: "Suppliers",
    lowest: "Lowest",
    average: "Average",
    median: "Median",
    highest: "Highest",
    noResults: "Nothing here yet",
    retry: "Retry",
    loginRequired: "Please log in to continue",
    boqTitle: "Have a BOQ?",
    boqSubtitle: "Get every supplier's price in seconds",
    boqResearch: "BOQ price research",
    shop: "Shop",
    cart: "Cart",
    checkout: "Checkout",
    addToCart: "Add to cart",
    add: "Add",
    buyNow: "Buy now",
    otherSellers: "Other sellers",
    deals: "Today's deals",
    featured: "Featured",
    newArrivals: "New arrivals",
    seeAll: "See all",
    addedToCart: "Added to cart",
    cartEmpty: "Your cart is empty",
    cartEmptyHint: "Browse the shop and add materials to get started.",
    from: "From",
    sellers: "sellers",
    seller: "seller",
    inStock: "In stock",
    outOfStock: "Out of stock",
    onRequest: "On request",
    referencePrice: "Reference price",
    subtotal: "Subtotal",
    vat: "VAT 15%",
    deliveryFee: "Delivery",
    total: "Total",
    placeOrder: "Place order",
    orderPlaced: "Order placed",
    requestQuotesInstead: "Request quotes instead",
    shopBannerTitle: "Build for less",
    shopBannerSubtitle: "Compare live supplier prices and order in minutes",
    searchProducts: "Search products, brands, SKUs",
    deal: "Deal",
    verified: "Verified",
    minQty: "Min. qty",
    leadTime: "Lead time",
    priceIncludesVat: "Price excl. VAT · 15% VAT added at checkout",
    remove: "Remove",
    quantity: "Qty",
    deliveryDetails: "Delivery details",
    paymentMethod: "Payment method",
    cod: "Cash on delivery",
    bankTransfer: "Bank transfer",
    card: "Card",
    cardHint: "Pay on delivery for now",
    notes: "Notes",
    directOrder: "Direct",
    rfqOrder: "RFQ",
    markAsPaid: "Mark as paid",
    paid: "Paid",
    unpaid: "Unpaid",
    viewOrder: "View order",
    continueShopping: "Continue shopping",
    estimated: "estimated",
  },
  ar: {
    home: "الرئيسية",
    search: "بحث",
    rfqs: "طلبات التسعير",
    orders: "الطلبات",
    profile: "الملف الشخصي",
    welcome: "مرحباً",
    searchPlaceholder: "ابحث عن مواد (أسمنت، حديد، بلوك...)",
    priceIndex: "مؤشر الأسعار",
    categories: "الفئات",
    recentlyUpdated: "أسعار محدثة مؤخراً",
    login: "تسجيل الدخول",
    register: "إنشاء حساب",
    logout: "تسجيل الخروج",
    requestQuotes: "اطلب عروض أسعار",
    myPriceList: "قائمة أسعاري",
    notifications: "الإشعارات",
    language: "اللغة",
    marketplace: "طلبات مفتوحة",
    myRfqs: "طلباتي",
    newRfq: "طلب تسعير جديد",
    suppliers: "الموردون",
    lowest: "الأقل",
    average: "المتوسط",
    median: "الوسيط",
    highest: "الأعلى",
    noResults: "لا يوجد شيء هنا بعد",
    retry: "إعادة المحاولة",
    loginRequired: "يرجى تسجيل الدخول للمتابعة",
    boqTitle: "لديك جدول كميات؟",
    boqSubtitle: "احصل على أسعار جميع الموردين في ثوانٍ",
    boqResearch: "بحث أسعار جدول الكميات",
    shop: "المتجر",
    cart: "السلة",
    checkout: "إتمام الشراء",
    addToCart: "أضف إلى السلة",
    add: "إضافة",
    buyNow: "اشترِ الآن",
    otherSellers: "بائعون آخرون",
    deals: "عروض اليوم",
    featured: "مميز",
    newArrivals: "وصل حديثاً",
    seeAll: "عرض الكل",
    addedToCart: "تمت الإضافة إلى السلة",
    cartEmpty: "سلتك فارغة",
    cartEmptyHint: "تصفح المتجر وأضف المواد للبدء.",
    from: "ابتداءً من",
    sellers: "بائعين",
    seller: "بائع",
    inStock: "متوفر",
    outOfStock: "غير متوفر",
    onRequest: "عند الطلب",
    referencePrice: "سعر مرجعي",
    subtotal: "المجموع الفرعي",
    vat: "ضريبة القيمة المضافة 15%",
    deliveryFee: "التوصيل",
    total: "الإجمالي",
    placeOrder: "تأكيد الطلب",
    orderPlaced: "تم تقديم الطلب",
    requestQuotesInstead: "اطلب عروض أسعار بدلاً من ذلك",
    shopBannerTitle: "ابنِ بتكلفة أقل",
    shopBannerSubtitle: "قارن أسعار الموردين المباشرة واطلب خلال دقائق",
    searchProducts: "ابحث عن منتجات، علامات تجارية، أرقام أصناف",
    deal: "عرض",
    verified: "موثّق",
    minQty: "الحد الأدنى للكمية",
    leadTime: "مدة التوريد",
    priceIncludesVat: "السعر غير شامل الضريبة · تُضاف 15% عند الدفع",
    remove: "إزالة",
    quantity: "الكمية",
    deliveryDetails: "تفاصيل التوصيل",
    paymentMethod: "طريقة الدفع",
    cod: "الدفع عند الاستلام",
    bankTransfer: "تحويل بنكي",
    card: "بطاقة",
    cardHint: "الدفع عند الاستلام حالياً",
    notes: "ملاحظات",
    directOrder: "مباشر",
    rfqOrder: "طلب تسعير",
    markAsPaid: "تحديد كمدفوع",
    paid: "مدفوع",
    unpaid: "غير مدفوع",
    viewOrder: "عرض الطلب",
    continueShopping: "متابعة التسوق",
    estimated: "تقديري",
  },
} as const;

export type TranslationKey = keyof typeof dictionary.en;

interface I18nContextValue {
  locale: Locale;
  isRTL: boolean;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // We only use I18nManager to flag direction for labels; a full RTL flip
    // requires an app reload, which we intentionally avoid here.
    I18nManager.allowRTL(next === "ar");
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "en" ? "ar" : "en");
  }, [locale, setLocale]);

  const t = useCallback(
    (key: TranslationKey) => dictionary[locale][key] ?? dictionary.en[key],
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, isRTL: locale === "ar", setLocale, toggleLocale, t }),
    [locale, setLocale, toggleLocale, t],
  );

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
