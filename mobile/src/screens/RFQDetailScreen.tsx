import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { api, Bid, RFQ } from '../api';
import { money, t } from '../i18n';
import { useLoad, useStore } from '../store';
import { C, S } from '../theme';
import { Badge, Btn, Spinner, Status } from '../components/ui';

export default function RFQDetailScreen({ route }: any) {
  const { id } = route.params;
  const { user } = useStore();
  const res = useLoad(() => api.get<RFQ>(`/rfq/${id}`), [id]);
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [days, setDays] = useState('3'); const [fee, setFee] = useState('0'); const [busy, setBusy] = useState(false);
  useEffect(() => { const m = res.data?.my_bid; if (m) { const p: Record<number, string> = {}; m.items.forEach(i => (p[i.rfq_item_id] = String(i.unit_price))); setPrices(p); setDays(String(m.delivery_days)); setFee(String(m.delivery_fee)); } }, [res.data]);
  if (res.loading || !res.data) return <Spinner />;
  const r = res.data;
  const isOwner = user && (user.id === (r as any).buyer_id || user.role === 'admin');
  const subtotal = r.items.reduce((s, it) => s + (Number(prices[it.id]) || 0) * it.quantity, 0) + Number(fee || 0);
  const submit = async () => {
    setBusy(true);
    try { await api.post(`/rfq/${r.id}/bids`, { delivery_days: Number(days), delivery_fee: Number(fee), items: r.items.map(it => ({ rfq_item_id: it.id, unit_price: Number(prices[it.id] || 0) })) }); res.reload(); Alert.alert('✓', t('submitted')); }
    catch (e: any) { Alert.alert(t('error'), e.message); } finally { setBusy(false); }
  };
  const award = (b: Bid) => Alert.alert(t('award'), `${b.supplier?.name} — ${money(b.total)}`, [{ text: t('cancel') }, { text: t('confirm'), onPress: async () => { try { await api.post(`/rfq/${r.id}/award/${b.id}`); res.reload(); } catch (e: any) { Alert.alert(t('error'), e.message); } } }]);
  const locked = r.my_bid && !['submitted', 'withdrawn'].includes(r.my_bid.status);
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad}>
      <View style={[S.row, S.between]}><Text style={S.h1}>{r.title}</Text><Status s={r.status} /></View>
      <Text style={S.muted}>#{r.id} · {r.city} · {r.bid_count} {t('bids')}{r.buyer_name && !isOwner ? ` · ${r.buyer_name}` : ''}</Text>
      <Text style={[S.h2, { marginTop: 12 }]}>{t('items')}</Text>
      {r.items.map(it => (
        <View key={it.id} style={S.card}>
          <Text style={S.bold}>{it.description}</Text>
          <Text style={S.muted}>{t('qty')}: {it.quantity} {it.unit}{it.market_min != null ? ` · ${t('market_ref')}: ${money(it.market_min)} – ${money(it.market_avg)}` : ''}</Text>
          {user?.role === 'supplier' && <><Text style={S.label}>{t('unit_price')} ({t('ex_vat')})</Text><TextInput style={S.input} keyboardType="decimal-pad" editable={!locked} value={prices[it.id] ?? ''} onChangeText={v => setPrices({ ...prices, [it.id]: v })} /></>}
        </View>
      ))}
      {user?.role === 'supplier' && (
        <View style={[S.card, { borderColor: C.primary }]}>
          <View style={[S.row, S.between]}><Text style={S.h2}>{t('my_bid')}</Text>{r.my_bid && <Status s={r.my_bid.status} />}</View>
          <View style={S.row}><View style={{ flex: 1 }}><Text style={S.label}>{t('delivery_days')}</Text><TextInput style={S.input} keyboardType="numeric" editable={!locked} value={days} onChangeText={setDays} /></View><View style={{ flex: 1 }}><Text style={S.label}>{t('total')} +</Text><TextInput style={S.input} keyboardType="decimal-pad" editable={!locked} value={fee} onChangeText={setFee} /></View></View>
          <Text style={S.bold}>{t('total')} ({t('inc_vat')}): {money(subtotal * 1.15)}</Text>
          {!locked && r.status === 'open' && <Btn title={r.my_bid?.status === 'submitted' ? t('my_bid') + ' ↻' : t('submit_bid')} onPress={submit} disabled={busy} style={{ marginTop: 10 }} />}
        </View>
      )}
      {isOwner && (
        <>
          <Text style={[S.h2, { marginTop: 12 }]}>{t('bids')} {r.best_total != null ? `· ${t('best_total')} ${money(r.best_total)}` : ''}</Text>
          {(r.bids || []).map(b => (
            <View key={b.id} style={[S.card, b.rank === 1 && S.hl]}>
              <View style={[S.row, S.between]}><Text style={S.bold}>#{b.rank} {b.supplier?.name} {b.supplier?.verified ? '✓' : ''}</Text><Status s={b.status} /></View>
              <Text style={S.muted}>★ {b.supplier?.rating || '—'} · {b.delivery_days} {t('delivery_days')}</Text>
              <View style={[S.row, S.between, { marginTop: 6 }]}><Text style={S.price}>{money(b.total)}</Text>{b.status === 'submitted' && r.status !== 'awarded' && <Btn title={t('award')} onPress={() => award(b)} />}</View>
              {b.items.map(bi => { const it = r.items.find(x => x.id === bi.rfq_item_id); return <Text key={bi.rfq_item_id} style={S.muted}>{it?.description}: {money(bi.unit_price)} × {bi.quantity} = {money(bi.line_total)}</Text>; })}
            </View>
          ))}
          {!r.bids?.length && <Badge text={t('no_data')} />}
        </>
      )}
    </ScrollView>
  );
}
