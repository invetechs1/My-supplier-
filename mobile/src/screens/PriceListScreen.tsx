import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, Offer, Product } from '../api';
import { money, nm, t } from '../i18n';
import { useLoad } from '../store';
import { C, S } from '../theme';
import { Btn, Empty, Spinner, Status } from '../components/ui';

export default function PriceListScreen() {
  const res = useLoad(() => api.get<Offer[]>('/suppliers/me/offers'));
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Product[]>([]); const [picked, setPicked] = useState<Product | null>(null); const [price, setPrice] = useState('');
  useEffect(() => { if (!q.trim()) { setHits([]); return; } const h = setTimeout(() => api.get<any>('/catalog/products', { q, size: 6 }).then(r => setHits(r.items)).catch(() => {}), 300); return () => clearTimeout(h); }, [q]);
  const save = async () => { if (!picked) return; try { await api.post('/suppliers/me/offers', { product_id: picked.id, price: Number(price) }); setPicked(null); setPrice(''); res.reload(); } catch (e: any) { Alert.alert(t('error'), e.message); } };
  const update = async (o: Offer, v: string) => { const p = Number(v); if (!p || p === o.price_ex_vat) return; try { await api.patch(`/suppliers/me/offers/${o.id}`, { price: p, includes_vat: false }); res.reload(); } catch (e: any) { Alert.alert(t('error'), e.message); } };
  return (
    <View style={S.screen}>
      <View style={S.pad}>
        {picked ? (
          <View style={[S.card, { borderColor: C.primary }]}><Text style={S.bold}>{nm(picked)} <Text style={S.muted}>{picked.unit}</Text></Text>
            <TextInput style={S.input} placeholder={t('unit_price')} keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
            <View style={S.row}><Btn title={t('confirm')} onPress={save} style={{ flex: 1 }} /><Btn ghost title={t('cancel')} onPress={() => setPicked(null)} /></View></View>
        ) : <TextInput style={S.input} placeholder={'+ ' + t('search')} value={q} onChangeText={setQ} />}
        {hits.map(h => <TouchableOpacity key={h.id} style={[S.card, { paddingVertical: 8 }]} onPress={() => { setPicked(h); setQ(''); setHits([]); }}><Text style={S.text}>{nm(h)} <Text style={S.muted}>{h.brand} · {h.unit}</Text></Text></TouchableOpacity>)}
      </View>
      {res.loading && !res.data ? <Spinner /> : (
        <FlatList data={res.data || []} keyExtractor={o => String(o.id)} contentContainerStyle={S.pad} ListEmptyComponent={<Empty />}
          renderItem={({ item: o }) => (
            <View style={[S.card, S.row, S.between]}>
              <View style={{ flex: 1 }}><Text style={S.bold}>{nm(o.product!)}</Text><Text style={S.muted}>{o.city} · {o.unit} · <Status s={o.stock_status} /></Text></View>
              <TextInput style={[S.input, { width: 100, marginBottom: 0 }]} keyboardType="decimal-pad" defaultValue={String(o.price_ex_vat)} onEndEditing={e => update(o, e.nativeEvent.text)} />
            </View>
          )} />
      )}
      <Text style={[S.muted, { textAlign: 'center', padding: 8 }]}>{money(0, 0).replace('0', '')} {t('ex_vat')}</Text>
    </View>
  );
}
