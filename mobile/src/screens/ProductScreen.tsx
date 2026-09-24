import React, { useState } from 'react';
import { Alert, Image, Linking, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, imageUrl, Offer, ProductDetail, ProductReview } from '../api';
import { money, nm, t } from '../i18n';
import { useLoad, useStore } from '../store';
import { C, S } from '../theme';
import { Badge, Btn, Change, Spinner, Stat, Status } from '../components/ui';

function MiniChart({ data }: { data: ProductDetail['history'] }) {
  if (data.length < 2) return null;
  const min = Math.min(...data.map(d => d.min_price)), max = Math.max(...data.map(d => d.max_price)), span = max - min || 1;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 2 }}>
      {data.map(d => <View key={d.date} style={{ flex: 1, height: `${10 + ((d.avg_price - min) / span) * 90}%`, backgroundColor: C.primary2, borderRadius: 2 }} />)}
    </View>
  );
}

export default function ProductScreen({ route, navigation }: any) {
  const { id } = route.params;
  const { user, addQuote, quote, addToCart, favorites, toggleFav } = useStore();
  const res = useLoad(() => api.get<ProductDetail>(`/catalog/products/${id}`), [id]);
  const reviews = useLoad(() => api.get<ProductReview[]>(`/catalog/products/${id}/reviews`), [id]);
  const [order, setOrder] = useState<Offer | null>(null); const [qty, setQty] = useState('1');
  const [rv, setRv] = useState({ rating: 5, title: '', comment: '' });
  if (res.loading || !res.data) return <Spinner />;
  const p = res.data, s = p.summary!;
  const shopper = !user || user.role === 'buyer';
  const place = async (goCart = false) => {
    try { await addToCart({ ...order!, product: order!.product || p }, Number(qty) || order!.min_qty); setOrder(null); if (goCart) navigation.navigate('Tabs', { screen: 'Cart' }); else Alert.alert('✓', t('in_cart')); }
    catch (e: any) { Alert.alert(t('error'), e.message); }
  };
  const sendReview = async () => {
    if (!user) return navigation.navigate('Login');
    try { await api.post(`/catalog/products/${p.id}/reviews`, rv); setRv({ rating: 5, title: '', comment: '' }); reviews.reload(); res.reload(); } catch (e: any) { Alert.alert(t('error'), e.message); }
  };
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad}>
      <View><Image source={{ uri: imageUrl(order?.image_url || p.image_url) }} style={{ width: '100%', height: 200, borderRadius: 11, backgroundColor: C.soft, marginBottom: 10 }} resizeMode="contain" />
        {shopper && <TouchableOpacity onPress={() => toggleFav(p)} style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#fff', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18, color: favorites.includes(p.id) ? '#D1434B' : '#bbb' }}>{favorites.includes(p.id) ? '♥' : '♡'}</Text></TouchableOpacity>}</View>
      <Text style={S.h1}>{nm(p)}</Text>
      <Text style={S.muted}>{p.brand} · {p.sku} · {p.unit}{p.rating_count > 0 ? ` · ★ ${p.rating} (${p.rating_count})` : ''}</Text>
      <View style={[S.row, { marginVertical: 10, flexWrap: 'wrap' }]}>
        <Stat label={t('best_price')} value={money(s.min_price)} /><Stat label={t('avg')} value={money(s.avg_price)} />
      </View>
      <View style={[S.row, { marginBottom: 10 }]}><Text style={S.muted}>{s.offer_count} {t('offers')} · {s.supplier_count} {t('supplier')} · {t('change_30d')}: </Text><Change pct={s.change_30d_pct} /></View>
      {(!user || user.role === 'buyer') && <Btn title={quote.some(i => i.product_id === p.id) ? t('added') : '+ ' + t('add_to_rfq')} onPress={() => addQuote(p)} style={{ marginBottom: 12 }} />}
      {p.offers.map((o, i) => (
        <View key={o.id} style={[S.card, i === 0 && S.hl]}>
          <View style={[S.row, S.between]}>
            <Text style={S.bold}>{i + 1}. {o.supplier?.is_external ? o.source_name || o.supplier?.name : o.supplier?.name}</Text>
            {o.supplier?.verified ? <Badge text={'✓ ' + t('verified')} /> : o.supplier?.is_external ? <Badge text={t('external')} /> : null}
          </View>
          <Text style={S.muted}>{o.city} · {t('min_qty')} {o.min_qty} · <Status s={o.stock_status} />{o.available_qty != null ? ` · ${o.available_qty} ${t('only_left')}` : ''}</Text>
          <View style={[S.row, S.between, { marginTop: 6 }]}>
            <View><Text style={S.price}>{money(o.price_ex_vat)} <Text style={S.muted}>{o.rental_period ? t('per_' + o.rental_period) : `/ ${o.unit || p.unit}`}</Text></Text>{!!o.rental_period && <Text style={[S.badge, { alignSelf: 'flex-start' }]}>{t('rent')}</Text>}<Text style={S.muted}>{t('inc_vat')}: {money(o.price_inc_vat)}</Text></View>
            {o.supplier?.is_external ? (o.supplier && (o as any).source_url ? <Btn ghost title="↗" onPress={() => Linking.openURL((o as any).source_url)} /> : null)
              : shopper && o.stock_status !== 'out_of_stock' ? <Btn title={'🛒 ' + t('add_to_cart')} onPress={() => { setOrder(o); setQty(String(o.min_qty)); }} /> : null}
          </View>
        </View>
      ))}
      <View style={S.card}><Text style={S.h2}>{t('history')}</Text><MiniChart data={p.history} /></View>
      <View style={S.card}><Text style={S.h2}>{t('reviews')}</Text>
        {(reviews.data || []).length === 0 && <Text style={S.muted}>{t('no_reviews')}</Text>}
        {(reviews.data || []).map(r => <View key={r.id} style={{ marginBottom: 8 }}><Text style={S.bold}>{'★'.repeat(r.rating)} {r.title} {r.verified ? <Badge text={t('verified_purchase')} /> : null}</Text><Text style={S.muted}>{r.author}</Text>{!!r.comment && <Text style={S.text}>{r.comment}</Text>}</View>)}
        {shopper && <View style={{ marginTop: 6 }}><Text style={S.label}>{t('write_review')}</Text>
          <View style={S.row}>{[1, 2, 3, 4, 5].map(n => <TouchableOpacity key={n} onPress={() => setRv({ ...rv, rating: n })}><Text style={{ fontSize: 24, color: n <= rv.rating ? '#F2B134' : '#ccc' }}>★</Text></TouchableOpacity>)}</View>
          <TextInput style={S.input} placeholder={t('title')} value={rv.title} onChangeText={v => setRv({ ...rv, title: v })} />
          <TextInput style={S.input} placeholder={t('notes')} value={rv.comment} onChangeText={v => setRv({ ...rv, comment: v })} />
          <Btn ghost title={t('send')} onPress={sendReview} /></View>}
      </View>
      {order && (
        <View style={[S.card, { borderColor: C.primary }]}>
          <Text style={S.h2}>{order.supplier?.name}</Text>
          <Text style={S.label}>{t('qty')} ({order.unit || p.unit}) · {t('min_qty')} {order.min_qty}</Text><TextInput style={S.input} keyboardType="numeric" value={qty} onChangeText={setQty} />
          <Text style={[S.bold, { marginBottom: 8 }]}>{t('total')} ({t('inc_vat')}): {money(order.price_ex_vat * Number(qty || 0) * 1.15)}</Text>
          <View style={S.row}><Btn title={'🛒 ' + t('add_to_cart')} onPress={() => place(false)} style={{ flex: 1 }} /><Btn ghost title={t('buy_now')} onPress={() => place(true)} /><Btn ghost title={t('cancel')} onPress={() => setOrder(null)} /></View>
        </View>
      )}
      <TouchableOpacity onPress={() => navigation.goBack()}><Text style={[S.muted, { textAlign: 'center', padding: 12 }]}>‹ {t('prices')}</Text></TouchableOpacity>
    </ScrollView>
  );
}
