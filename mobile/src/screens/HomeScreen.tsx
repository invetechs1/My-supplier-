import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Image, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, Category, HomeSections, imageUrl, Product } from '../api';
import { money, nm, t } from '../i18n';
import { useLoad, useStore } from '../store';
import { C, S } from '../theme';
import { Change, Empty, Spinner } from '../components/ui';

export function ProductRow({ p, onPress }: { p: Product; onPress: () => void }) {
  const { user, addQuote, quote, addToCart, cart, favorites, toggleFav } = useStore();
  const s = p.summary;
  const added = quote.some(i => i.product_id === p.id);
  const shopper = !user || user.role === 'buyer';
  const inCart = !!s?.best_offer_id && !!cart?.groups.some(g => g.items.some(i => i.offer_id === s.best_offer_id));
  const add = async () => {
    if (!s?.best_offer_id) return;
    try { const d = await api.get<any>(`/catalog/products/${p.id}`); const o = d.offers.find((x: any) => x.id === s.best_offer_id); if (o) await addToCart({ ...o, product: o.product || d }, o.min_qty || 1); }
    catch (e: any) { Alert.alert(t('error'), e.message); }
  };
  return (
    <TouchableOpacity style={[S.card, S.row, { alignItems: 'flex-start' }]} onPress={onPress}>
      <View><Image source={{ uri: imageUrl(p.image_url) }} style={{ width: 84, height: 84, borderRadius: 8, backgroundColor: C.soft }} />
        {shopper && <TouchableOpacity onPress={toggleFav.bind(null, p)} style={{ position: 'absolute', top: 4, right: 4, backgroundColor: '#fff', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: favorites.includes(p.id) ? '#D1434B' : '#bbb' }}>{favorites.includes(p.id) ? '♥' : '♡'}</Text></TouchableOpacity>}</View>
      <View style={{ flex: 1 }}>
        <View style={[S.row, S.between]}><Text style={[S.bold, { flex: 1 }]} numberOfLines={2}>{nm(p)}</Text>{s?.change_30d_pct != null && <Change pct={s.change_30d_pct} />}</View>
        <Text style={S.muted}>{p.brand || p.sku} · {p.unit} · {nm({ name_ar: p.category_name_ar, name_en: p.category_name_en })}{p.rating_count > 0 ? ` · ★ ${p.rating} (${p.rating_count})` : ''}</Text>
        {s && s.offer_count > 0 ? (
          <View style={{ marginTop: 4 }}>
            <Text style={S.price}>{money(s.min_price)}{s.basis ? ' ' + t('per_' + s.basis) : ''}</Text>
            <Text style={S.muted}>{s.basis ? t('rent') : `${t('avg')} ${money(s.avg_price)}`}{!s.basis && s.rental_min_price != null ? ` · ${t('rent_from')} ${money(s.rental_min_price)} ${t('per_' + (s.rental_basis || 'day'))}` : ''} · {s.offer_count} {t('offers')}</Text>
            {shopper && <View style={[S.row, { marginTop: 6 }]}>
              {s.best_offer_id ? <TouchableOpacity style={inCart ? S.btnGhost : S.btn} onPress={add}><Text style={inCart ? S.btnGhostText : S.btnText}>{inCart ? t('in_cart') : '🛒 ' + t('add_to_cart')}</Text></TouchableOpacity> : <Text style={S.badge}>{t('reference_only')}</Text>}
              <TouchableOpacity style={S.btnGhost} onPress={() => addQuote(p)}><Text style={S.btnGhostText}>{added ? t('added') : '+ ' + t('add_to_rfq')}</Text></TouchableOpacity>
            </View>}
          </View>
        ) : <Text style={S.muted}>{t('no_data')}</Text>}
      </View>
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
  const home = useLoad(() => api.get<HomeSections>('/market/home'));
  const Section = ({ k, items }: { k: string; items: Product[] }) => !items?.length ? null : (
    <View style={{ marginBottom: 8 }}><Text style={[S.h2, { paddingHorizontal: 14 }]}>{t(k)}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}>
        {items.slice(0, 8).map(p => <TouchableOpacity key={p.id} style={[S.card, { width: 150, marginBottom: 0, padding: 8 }]} onPress={() => navigation.navigate('Product', { id: p.id })}>
          <Image source={{ uri: imageUrl(p.image_url) }} style={{ width: '100%', height: 90, borderRadius: 6, backgroundColor: C.soft }} />
          <Text style={[S.bold, { fontSize: 12.5, marginTop: 4 }]} numberOfLines={2}>{nm(p)}</Text>
          <Text style={[S.price, { fontSize: 14 }]}>{money(p.summary?.min_price)}</Text>
        </TouchableOpacity>)}
      </ScrollView></View>
  );
  const showSections = !debounced && !cat && !city && home.data;
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
          ListHeaderComponent={showSections ? <View style={{ marginHorizontal: -14 }}><Section k="best_sellers" items={home.data!.best_sellers} /><Section k="new_arrivals" items={home.data!.new_arrivals} /><Section k="top_rated" items={home.data!.top_rated} /><Text style={[S.h2, { paddingHorizontal: 14 }]}>{t('prices')}</Text></View> : null}
          refreshControl={<RefreshControl refreshing={res.loading} onRefresh={res.reload} />}
          renderItem={({ item }) => <ProductRow p={item} onPress={() => navigation.navigate('Product', { id: item.id })} />} />
      )}
    </View>
  );
}
