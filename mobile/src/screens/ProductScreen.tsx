import React, { useState } from 'react';
import { Alert, Linking, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, Offer, ProductDetail } from '../api';
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
  const { user, addQuote, quote } = useStore();
  const res = useLoad(() => api.get<ProductDetail>(`/catalog/products/${id}`), [id]);
  const [order, setOrder] = useState<Offer | null>(null); const [qty, setQty] = useState('1'); const [addr, setAddr] = useState('');
  if (res.loading || !res.data) return <Spinner />;
  const p = res.data, s = p.summary!;
  const place = async () => {
    if (!user) return navigation.navigate('Login');
    try { const o = await api.post<any>('/orders/direct', { offer_id: order!.id, quantity: Number(qty), delivery_address: addr }); setOrder(null); Alert.alert('✓', `#${o.id} — ${money(o.total)}`); }
    catch (e: any) { Alert.alert(t('error'), e.message); }
  };
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad}>
      <Text style={S.h1}>{nm(p)}</Text>
      <Text style={S.muted}>{p.brand} · {p.sku} · {p.unit}</Text>
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
          <Text style={S.muted}>{o.city} · {t('min_qty')} {o.min_qty} · <Status s={o.stock_status} /></Text>
          <View style={[S.row, S.between, { marginTop: 6 }]}>
            <View><Text style={S.price}>{money(o.price_ex_vat)} <Text style={S.muted}>{o.rental_period ? t('per_' + o.rental_period) : `/ ${o.unit || p.unit}`}</Text></Text>{!!o.rental_period && <Text style={[S.badge, { alignSelf: 'flex-start' }]}>{t('rent')}</Text>}<Text style={S.muted}>{t('inc_vat')}: {money(o.price_inc_vat)}</Text></View>
            {o.supplier?.is_external ? (o.supplier && (o as any).source_url ? <Btn ghost title="↗" onPress={() => Linking.openURL((o as any).source_url)} /> : null)
              : (!user || user.role === 'buyer') ? <Btn title={t('confirm')} onPress={() => { setOrder(o); setQty(String(o.min_qty)); }} /> : null}
          </View>
        </View>
      ))}
      <View style={S.card}><Text style={S.h2}>{t('history')}</Text><MiniChart data={p.history} /></View>
      {order && (
        <View style={[S.card, { borderColor: C.primary }]}>
          <Text style={S.h2}>{order.supplier?.name}</Text>
          <Text style={S.label}>{t('qty')} ({order.unit || p.unit})</Text><TextInput style={S.input} keyboardType="numeric" value={qty} onChangeText={setQty} />
          <Text style={S.label}>{t('city')}</Text><TextInput style={S.input} value={addr} onChangeText={setAddr} />
          <Text style={[S.bold, { marginBottom: 8 }]}>{t('total')} ({t('inc_vat')}): {money(order.price_ex_vat * Number(qty || 0) * 1.15)}</Text>
          <View style={S.row}><Btn title={t('confirm')} onPress={place} style={{ flex: 1 }} /><Btn ghost title={t('cancel')} onPress={() => setOrder(null)} /></View>
        </View>
      )}
      <TouchableOpacity onPress={() => navigation.goBack()}><Text style={[S.muted, { textAlign: 'center', padding: 12 }]}>‹ {t('prices')}</Text></TouchableOpacity>
    </ScrollView>
  );
}
