import React, { useEffect, useState } from 'react';
import { Alert, Image, Linking, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Address, api, GroupCheckout, imageUrl, Order } from '../api';
import { money, nm, t } from '../i18n';
import { useStore } from '../store';
import { C, S } from '../theme';
import { Badge, Btn, Empty } from '../components/ui';
const METHODS = ['mada', 'card', 'applepay', 'stcpay', 'bank_transfer'];

export default function CartScreen({ navigation }: any) {
  const { user, cart, refreshCart, setCartQty, removeFromCart, clearCart } = useStore();
  const [coupon, setCoupon] = useState(''); const [applied, setApplied] = useState('');
  const [addresses, setAddresses] = useState<Address[]>([]); const [addressId, setAddressId] = useState<number | null>(null); const [typed, setTyped] = useState('');
  const [orders, setOrders] = useState<Order[] | null>(null); const [busy, setBusy] = useState(false);
  const isBuyer = user?.role === 'buyer';
  useFocusEffect(React.useCallback(() => { refreshCart(applied); }, [user?.id])); // eslint-disable-line
  useEffect(() => { if (isBuyer) api.get<Address[]>('/account/addresses').then(a => { setAddresses(a); const d = a.find(x => x.is_default) || a[0]; if (d) setAddressId(d.id); }).catch(() => {}); }, [isBuyer]);
  const checkout = async () => {
    setBusy(true);
    try { const os = await api.post<Order[]>('/cart/checkout', { address_id: typed ? null : addressId, delivery_address: typed, coupon_code: applied }); setOrders(os); await refreshCart(); }
    catch (e: any) { Alert.alert(t('error'), e.message); } finally { setBusy(false); }
  };
  const payAll = async (method: string) => {
    if (!orders) return;
    try { const g = await api.post<GroupCheckout>('/payments/checkout-group', { order_ids: orders.map(o => o.id), method }); if (g.method === 'bank_transfer') Alert.alert(t('bank_transfer'), g.bank_instructions); else if (g.checkout_url) await Linking.openURL(g.checkout_url); setOrders(null); navigation.navigate('Orders'); }
    catch (e: any) { Alert.alert(t('error'), e.message); }
  };
  if (user && !isBuyer) return <View style={[S.screen, S.pad]}><Empty text={t('buyer_only')} /></View>;
  if (!cart || cart.groups.length === 0) return <View style={[S.screen, S.pad]}><Empty text={t('cart_empty')} /><Btn title={t('prices')} onPress={() => navigation.navigate('Home')} /></View>;
  if (orders) return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad}>
      <Text style={S.h1}>✓ {t('orders_created')} ({orders.length})</Text>
      {orders.map(o => <View key={o.id} style={S.card}><Text style={S.bold}>#{o.id} · {o.supplier?.name}</Text><Text style={S.price}>{money(o.total)}</Text></View>)}
      <Text style={S.h2}>{t('pay_all')} — {money(orders.reduce((a, o) => a + o.total, 0))}</Text>
      <Text style={S.label}>{t('choose_method')}</Text>
      <View style={[S.row, { flexWrap: 'wrap' }]}>{METHODS.map(m => <TouchableOpacity key={m} style={[S.btnGhost, { borderWidth: 1, borderColor: C.line }]} onPress={() => payAll(m)}><Text style={S.btnGhostText}>{t(m)}</Text></TouchableOpacity>)}</View>
      <Text style={[S.muted, { marginVertical: 8 }]}>{t('escrow_note')}</Text>
      <Btn ghost title={t('orders')} onPress={() => { setOrders(null); navigation.navigate('Orders'); }} />
    </ScrollView>
  );
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad}>
      <View style={[S.row, S.between]}><Text style={S.h1}>🛒 {t('cart')} ({cart.item_count})</Text><Btn ghost title={t('clear')} onPress={clearCart} /></View>
      {cart.groups.map(g => (
        <View key={g.supplier.id} style={S.card}>
          <View style={[S.row, S.between]}><Text style={S.bold}>{t('sold_by')} {g.supplier.name}</Text>{g.delivery_fee > 0 ? <Text style={S.muted}>{t('delivery')}: {money(g.delivery_fee)}</Text> : <Badge text={t('free_delivery')} />}</View>
          {g.below_minimum && <Text style={S.error}>{t('min_qty')}: {money(g.min_order_amount)}</Text>}
          {g.items.map(it => (
            <View key={it.id} style={[S.row, { marginTop: 10, alignItems: 'flex-start' }]}>
              <Image source={{ uri: imageUrl(it.offer.image_url || it.offer.product?.image_url) }} style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: C.soft }} />
              <View style={{ flex: 1 }}>
                <Text style={S.bold}>{nm(it.offer.product!)}</Text>
                <Text style={S.muted}>{money(it.offer.price_ex_vat)} {it.offer.rental_period ? t('per_' + it.offer.rental_period) : `/ ${it.offer.unit}`} · {t('min_qty')} {it.offer.min_qty}</Text>
                <View style={[S.row, { marginTop: 4 }]}>
                  <TouchableOpacity style={S.btnGhost} onPress={() => setCartQty(it, Math.max(it.offer.min_qty || 1, it.quantity - 1))}><Text style={S.btnGhostText}>−</Text></TouchableOpacity>
                  <Text style={S.bold}>{it.quantity}</Text>
                  <TouchableOpacity style={S.btnGhost} onPress={() => setCartQty(it, it.quantity + 1)}><Text style={S.btnGhostText}>+</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => removeFromCart(it)}><Text style={[S.muted, { marginStart: 8 }]}>🗑 {t('remove')}</Text></TouchableOpacity>
                </View>
              </View>
              <Text style={S.bold}>{money(it.line_total)}</Text>
            </View>
          ))}
        </View>
      ))}
      <View style={S.card}>
        <Text style={S.h2}>{t('total')}</Text>
        <Text style={S.text}>{t('subtotal')}: {money(cart.subtotal)}</Text>
        <Text style={S.text}>{t('delivery')}: {cart.delivery_total > 0 ? money(cart.delivery_total) : t('free_delivery')}</Text>
        {cart.discount > 0 && <Text style={[S.text, { color: '#1E7D4F' }]}>{t('discount')} ({cart.coupon_code}): −{money(cart.discount)}</Text>}
        <Text style={S.text}>{t('vat')}: {money(cart.vat)}</Text>
        <Text style={[S.price, { marginTop: 4 }]}>{money(cart.total)}</Text>
        {isBuyer && <View style={[S.row, { marginTop: 8 }]}><TextInput style={[S.input, { flex: 1, marginBottom: 0 }]} placeholder={t('coupon')} autoCapitalize="characters" value={coupon} onChangeText={setCoupon} /><Btn ghost title={t('apply')} onPress={() => { setApplied(coupon.trim().toUpperCase()); refreshCart(coupon.trim().toUpperCase()); }} /></View>}
        {!!cart.coupon_error && <Text style={{ color: C.danger, marginTop: 4 }}>{cart.coupon_error}</Text>}
        <Text style={[S.muted, { marginTop: 8 }]}>{t('escrow_note')}</Text>
      </View>
      {!user ? <Btn title={t('login_to_checkout')} onPress={() => navigation.navigate('Login')} /> : (
        <View style={S.card}>
          <Text style={S.h2}>📍 {t('address')}</Text>
          {addresses.map(a => <TouchableOpacity key={a.id} style={[S.row, { marginBottom: 6 }]} onPress={() => { setAddressId(a.id); setTyped(''); }}><Text style={{ fontSize: 18 }}>{addressId === a.id && !typed ? '◉' : '○'}</Text><View style={{ flex: 1 }}><Text style={S.bold}>{a.label || a.city}</Text><Text style={S.muted}>{a.formatted}</Text></View></TouchableOpacity>)}
          <TextInput style={S.input} placeholder={t('city') + ' / ' + t('address')} value={typed} onChangeText={setTyped} />
          <Btn title={`${t('place_order')} · ${money(cart.total)}`} disabled={busy || cart.groups.some(g => g.below_minimum)} onPress={checkout} />
        </View>
      )}
    </ScrollView>
  );
}
