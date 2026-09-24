import React, { useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, Category, Product } from '../api';
import { money, nm, t } from '../i18n';
import { useLoad, useStore } from '../store';
import { C, S } from '../theme';
import { Change, Empty, Spinner } from '../components/ui';

export function ProductRow({ p, onPress }: { p: Product; onPress: () => void }) {
  const { user, addQuote, quote } = useStore();
  const s = p.summary;
  const added = quote.some(i => i.product_id === p.id);
  return (
    <TouchableOpacity style={S.card} onPress={onPress}>
      <View style={[S.row, S.between]}><Text style={S.bold}>{nm(p)}</Text>{s?.change_30d_pct != null && <Change pct={s.change_30d_pct} />}</View>
      <Text style={S.muted}>{p.brand || p.sku} · {p.unit} · {nm({ name_ar: p.category_name_ar, name_en: p.category_name_en })}</Text>
      {s && s.offer_count > 0 ? (
        <View style={[S.row, S.between, { marginTop: 6 }]}>
          <View><Text style={S.price}>{money(s.min_price)}{s.basis ? ' ' + t('per_' + s.basis) : ''}</Text><Text style={S.muted}>{s.basis ? t('rent') : `${t('avg')} ${money(s.avg_price)}`}{!s.basis && s.rental_min_price != null ? ` · ${t('rent_from')} ${money(s.rental_min_price)} ${t('per_' + (s.rental_basis || 'day'))}` : ''} · {s.offer_count} {t('offers')}</Text></View>
          {(!user || user.role === 'buyer') && <TouchableOpacity style={S.btnGhost} onPress={() => addQuote(p)}><Text style={S.btnGhostText}>{added ? t('added') : '+ ' + t('add_to_rfq')}</Text></TouchableOpacity>}
        </View>
      ) : <Text style={S.muted}>{t('no_data')}</Text>}
    </TouchableOpacity>
  );
}

export default function HomeScreen({ navigation }: any) {
  const [q, setQ] = useState(''); const [cat, setCat] = useState<number | null>(null); const [city, setCity] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const h = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(h); }, [q]);
  const cats = useLoad(() => api.get<Category[]>('/catalog/categories'));
  const cities = useLoad(() => api.get<string[]>('/catalog/cities'));
  const res = useLoad(() => api.get<{ items: Product[]; total: number }>('/catalog/products', { q: debounced, category_id: cat, city, size: 40, sort: debounced ? 'relevance' : 'offers' }), [debounced, cat, city]);
  return (
    <View style={S.screen}>
      <View style={{ backgroundColor: C.deep, padding: 12 }}>
        <View style={[S.row, S.between, { marginBottom: 8 }]}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>{t('brand')}</Text><Text style={{ color: C.light, fontWeight: '800', fontSize: 16, letterSpacing: 1 }}>BUILD FOR LESS</Text></View>
        <TextInput style={[S.input, { marginBottom: 8 }]} placeholder={t('search')} value={q} onChangeText={setQ} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity onPress={() => setCity('')} style={[S.btnGhost, { marginEnd: 6, backgroundColor: city ? '#fff2' : C.primary2 }]}><Text style={{ color: '#fff', fontWeight: '700' }}>{t('all')}</Text></TouchableOpacity>
          {(cities.data || []).map(c => <TouchableOpacity key={c} onPress={() => setCity(c)} style={[S.btnGhost, { marginEnd: 6, backgroundColor: city === c ? C.primary2 : '#fff2' }]}><Text style={{ color: '#fff', fontWeight: '700' }}>{c}</Text></TouchableOpacity>)}
        </ScrollView>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 48, paddingVertical: 6 }} contentContainerStyle={{ paddingHorizontal: 10, gap: 6 }}>
        <TouchableOpacity onPress={() => setCat(null)} style={[S.btnGhost, !cat && { backgroundColor: C.primary }]}><Text style={[S.btnGhostText, !cat && { color: '#fff' }]}>{t('categories')}</Text></TouchableOpacity>
        {(cats.data || []).filter(c => !c.parent_id).map(c => <TouchableOpacity key={c.id} onPress={() => setCat(c.id)} style={[S.btnGhost, cat === c.id && { backgroundColor: C.primary }]}><Text style={[S.btnGhostText, cat === c.id && { color: '#fff' }]}>{c.icon} {nm(c)}</Text></TouchableOpacity>)}
      </ScrollView>
      {res.loading && !res.data ? <Spinner /> : (
        <FlatList data={res.data?.items || []} keyExtractor={p => String(p.id)} contentContainerStyle={S.pad} ListEmptyComponent={<Empty />}
          refreshControl={<RefreshControl refreshing={res.loading} onRefresh={res.reload} />}
          renderItem={({ item }) => <ProductRow p={item} onPress={() => navigation.navigate('Product', { id: item.id })} />} />
      )}
    </View>
  );
}
