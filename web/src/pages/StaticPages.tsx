import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'

/** Legal/company pages. Final wording must be supplied by the company's legal advisor — see the go-live checklist. */
const CONTENT: Record<string, { ar: [string, string[]]; en: [string, string[]] }> = {
  terms: {
    ar: ['شروط الاستخدام', ['هذه صفحة نموذجية. يجب استبدال هذا النص بشروط الاستخدام المعتمدة من المستشار القانوني للشركة قبل الإطلاق.', 'تشمل الشروط عادةً: تعريف الخدمة، التزامات المشتري والمورّد، رسوم المنصة ونسبتها، سياسة الدفع وحجز المبالغ وتحويلها للمورّد بعد التسليم، سياسة الإلغاء والاسترداد والنزاعات، حدود المسؤولية، القانون الواجب التطبيق (المملكة العربية السعودية).']],
    en: ['Terms of Service', ['This is a placeholder. Replace with the terms approved by the company\'s legal advisor before launch.', 'Terms usually cover: service definition, buyer and supplier obligations, platform fee, escrow payment and payout policy, cancellation/refund/dispute policy, limitation of liability, governing law (Kingdom of Saudi Arabia).']],
  },
  privacy: {
    ar: ['سياسة الخصوصية', ['هذه صفحة نموذجية. يجب استبدالها بسياسة خصوصية متوافقة مع نظام حماية البيانات الشخصية (PDPL) قبل الإطلاق.', 'تشمل عادةً: البيانات التي نجمعها (الاسم، الجوال، البريد، بيانات الشركة، سجل الطلبات)، الغرض من المعالجة، مشاركة البيانات مع مزوّدي الدفع والرسائل، مدة الاحتفاظ، حقوق المستخدم، وسيلة التواصل.']],
    en: ['Privacy Policy', ['This is a placeholder. Replace with a PDPL-compliant privacy policy before launch.', 'It usually covers: data collected (name, phone, email, company details, order history), purposes, sharing with payment and messaging providers, retention, user rights, contact channel.']],
  },
  about: {
    ar: ['عن مورّدي', ['مورّدي — Build for Less: منصة سعودية تجمع أسعار مواد البناء من كل المورّدين في مكان واحد، وتتيح طلبات التسعير والمناقصة والشراء الآمن.', 'رسالتنا أن يحصل كل من يبني في المملكة على أفضل سعر لكل مادة بناء بشفافية كاملة.']],
    en: ['About My Supplier', ['My Supplier — Build for Less: a Saudi platform that brings building-material prices from every supplier into one place, with RFQs, bidding and secure purchasing.', 'Our mission: everyone who builds in the Kingdom gets the best price on every material, transparently.']],
  },
  contact: {
    ar: ['تواصل معنا', ['البريد: support@mysupplier.sa (يُستبدل بالبريد الرسمي) · الهاتف: +966 5X XXX XXXX · الرياض، المملكة العربية السعودية.', 'للمورّدين الراغبين بالانضمام: أنشئ حساب مورّد وارفع مستنداتك، وسيتواصل معك فريق التوثيق.']],
    en: ['Contact us', ['Email: support@mysupplier.sa (replace with the official address) · Phone: +966 5X XXX XXXX · Riyadh, Saudi Arabia.', 'Suppliers who want to join: create a supplier account and upload your documents; the verification team will contact you.']],
  },
}

export function StaticPage({ slug }: { slug: keyof typeof CONTENT }) {
  const { lang } = useI18n()
  const [title, paras] = CONTENT[slug][lang]
  return (
    <div className="container" style={{ padding: '30px 16px', maxWidth: 820 }}>
      <h1>{title}</h1>
      {paras.map((p, i) => <p key={i} style={{ fontSize: '1.05rem' }}>{p}</p>)}
    </div>
  )
}

export function NotFound() {
  const { lang } = useI18n()
  return (
    <div className="container" style={{ padding: '60px 16px', textAlign: 'center' }}>
      <div className="ltr" style={{ fontSize: '4rem', fontWeight: 800, color: 'var(--primary-2)' }}>404</div>
      <h1>{lang === 'ar' ? 'الصفحة غير موجودة' : 'Page not found'}</h1>
      <Link className="btn" to="/">{lang === 'ar' ? 'العودة للرئيسية' : 'Back to home'}</Link>
    </div>
  )
}
