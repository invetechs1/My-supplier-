import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth'
import { useI18n } from './i18n'
import { Portal, SiteLayout } from './components/Layout'
import { Spinner } from './components/ui'
import Home from './pages/Home'
import Catalog from './pages/Catalog'
import CartPage from './pages/CartPage'
import FavoritesPage from './pages/FavoritesPage'
import MyProducts from './pages/supplier/MyProducts'
import ProductPage from './pages/ProductPage'
import ComparePage from './pages/ComparePage'
import SuppliersPage from './pages/SuppliersPage'
import SupplierProfilePage from './pages/SupplierProfilePage'
import MarketPage from './pages/MarketPage'
import Login from './pages/Login'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import { NotFound, StaticPage } from './pages/StaticPages'
import BuyerPayments from './pages/buyer/BuyerPayments'
import Payouts from './pages/supplier/Payouts'
import AdminFinance from './pages/admin/AdminFinance'
import AdminOps from './pages/admin/AdminOps'
import AdminTrust from './pages/admin/AdminTrust'
import AdminOrders from './pages/admin/AdminOrders'
import AdminRFQs from './pages/admin/AdminRFQs'
import AdminCatalog from './pages/admin/AdminCatalog'
import AdminSettings from './pages/admin/AdminSettings'
import AdminMarketing from './pages/admin/AdminMarketing'
import NotificationsPage from './pages/NotificationsPage'
import SettingsPage from './pages/SettingsPage'
import BuyerHome from './pages/buyer/BuyerHome'
import NewRFQ from './pages/buyer/NewRFQ'
import MyRFQs from './pages/buyer/MyRFQs'
import RFQDetail from './pages/RFQDetail'
import BuyerOrders from './pages/buyer/BuyerOrders'
import AlertsPage from './pages/buyer/AlertsPage'
import SupplierDashboard from './pages/supplier/SupplierDashboard'
import PriceList from './pages/supplier/PriceList'
import OpenRFQs from './pages/supplier/OpenRFQs'
import MyBids from './pages/supplier/MyBids'
import SupplierOrders from './pages/supplier/SupplierOrders'
import SupplierProfileEdit from './pages/supplier/SupplierProfileEdit'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminSuppliers from './pages/admin/AdminSuppliers'
import AdminSources from './pages/admin/AdminSources'
import AdminQuality from './pages/admin/AdminQuality'

function Guard({ roles, children }: { roles: string[]; children: JSX.Element }) {
  const { user, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <div className="container" style={{ padding: 40 }}><Spinner /></div>
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (!roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function BuyerPortal() {
  const { t } = useI18n()
  return <Portal links={[
    { to: '/buyer', label: t('dashboard'), icon: '🏠' },
    { to: '/buyer/rfq/new', label: t('new_rfq'), icon: '➕' },
    { to: '/buyer/rfqs', label: t('my_rfqs'), icon: '📋' },
    { to: '/buyer/orders', label: t('orders'), icon: '📦' },
    { to: '/cart', label: t('cart'), icon: '🛒' },
    { to: '/favorites', label: t('favorites'), icon: '♥' },
    { to: '/buyer/payments', label: t('payments'), icon: '💳' },
    { to: '/buyer/alerts', label: t('alerts'), icon: '🔔' },
    { to: '/settings', label: t('settings'), icon: '⚙️' },
  ]} />
}
function SupplierPortal() {
  const { t } = useI18n()
  return <Portal links={[
    { to: '/supplier', label: t('dashboard'), icon: '📊' },
    { to: '/supplier/products', label: t('my_products'), icon: '🛍️' },
    { to: '/supplier/prices', label: t('price_list'), icon: '🏷️' },
    { to: '/supplier/rfqs', label: t('open_rfqs'), icon: '📨' },
    { to: '/supplier/bids', label: t('my_bids'), icon: '📝' },
    { to: '/supplier/orders', label: t('orders'), icon: '📦' },
    { to: '/supplier/payouts', label: t('payouts'), icon: '🏦' },
    { to: '/supplier/profile', label: t('profile'), icon: '🏢' },
    { to: '/settings', label: t('settings'), icon: '⚙️' },
  ]} />
}
function AdminPortal() {
  const { t } = useI18n()
  const g = (ar: string, en: string) => t('brand') === 'مورّدي' ? ar : en
  return <Portal links={[
    { to: '/admin', label: t('dashboard'), icon: '📈', group: g('نظرة عامة', 'Overview') },
    { to: '/admin/orders', label: t('orders'), icon: '📦', group: g('المبيعات', 'Sales') },
    { to: '/admin/rfqs', label: t('rfq'), icon: '📋', group: g('المبيعات', 'Sales') },
    { to: '/admin/finance', label: t('finance'), icon: '💰', group: g('المبيعات', 'Sales') },
    { to: '/admin/catalog', label: t('catalog_mgmt'), icon: '🗂️', group: g('الكتالوج', 'Catalog') },
    { to: '/admin/sources', label: t('sources'), icon: '🔗', group: g('الكتالوج', 'Catalog') },
    { to: '/admin/quality', label: t('data_quality'), icon: '🧪', group: g('الكتالوج', 'Catalog') },
    { to: '/admin/suppliers', label: t('suppliers'), icon: '🏢', group: g('المستخدمون', 'People') },
    { to: '/admin/users', label: t('users'), icon: '👥', group: g('المستخدمون', 'People') },
    { to: '/admin/trust', label: t('disputes'), icon: '🛡️', group: g('المستخدمون', 'People') },
    { to: '/admin/marketing', label: t('marketing'), icon: '📣', group: g('التشغيل', 'Operations') },
    { to: '/admin/ops', label: t('deliveries'), icon: '📡', group: g('التشغيل', 'Operations') },
    { to: '/admin/platform', label: t('settings'), icon: '🛠️', group: g('التشغيل', 'Operations') },
    { to: '/settings', label: t('profile'), icon: '⚙️', group: g('حسابي', 'Account') },
  ]} />
}

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<Home />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="products/:id" element={<ProductPage />} />
        <Route path="compare" element={<ComparePage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="suppliers/:id" element={<SupplierProfilePage />} />
        <Route path="market" element={<MarketPage />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="terms" element={<StaticPage slug="terms" />} />
        <Route path="privacy" element={<StaticPage slug="privacy" />} />
        <Route path="about" element={<StaticPage slug="about" />} />
        <Route path="contact" element={<StaticPage slug="contact" />} />
        <Route path="notifications" element={<Guard roles={['buyer', 'supplier', 'admin']}><NotificationsPage /></Guard>} />
        <Route path="settings" element={<Guard roles={['buyer', 'supplier', 'admin']}><div className="container" style={{ padding: '20px 16px' }}><SettingsPage /></div></Guard>} />
        <Route path="rfq/:id" element={<Guard roles={['buyer', 'supplier', 'admin']}><div className="container" style={{ padding: '20px 16px' }}><RFQDetail /></div></Guard>} />

        <Route path="buyer" element={<Guard roles={['buyer', 'admin']}><BuyerPortal /></Guard>}>
          <Route index element={<BuyerHome />} />
          <Route path="rfq/new" element={<NewRFQ />} />
          <Route path="rfqs" element={<MyRFQs />} />
          <Route path="rfqs/:id" element={<RFQDetail />} />
          <Route path="orders" element={<BuyerOrders />} />
          <Route path="payments" element={<BuyerPayments />} />
          <Route path="alerts" element={<AlertsPage />} />
        </Route>

        <Route path="supplier" element={<Guard roles={['supplier']}><SupplierPortal /></Guard>}>
          <Route index element={<SupplierDashboard />} />
          <Route path="products" element={<MyProducts />} />
          <Route path="prices" element={<PriceList />} />
          <Route path="rfqs" element={<OpenRFQs />} />
          <Route path="rfqs/:id" element={<RFQDetail />} />
          <Route path="bids" element={<MyBids />} />
          <Route path="orders" element={<SupplierOrders />} />
          <Route path="payouts" element={<Payouts />} />
          <Route path="profile" element={<SupplierProfileEdit />} />
        </Route>

        <Route path="admin" element={<Guard roles={['admin']}><AdminPortal /></Guard>}>
          <Route index element={<AdminDashboard />} />
          <Route path="suppliers" element={<AdminSuppliers />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="sources" element={<AdminSources />} />
          <Route path="quality" element={<AdminQuality />} />
          <Route path="finance" element={<AdminFinance />} />
          <Route path="ops" element={<AdminOps />} />
          <Route path="trust" element={<AdminTrust />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="rfqs" element={<AdminRFQs />} />
          <Route path="catalog" element={<AdminCatalog />} />
          <Route path="platform" element={<AdminSettings />} />
          <Route path="marketing" element={<AdminMarketing />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
