import React, { useState } from 'react';
import { Alert, FlatList, Image, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, imageUrl, Offer, upload } from '../api';
import { money, nm, t } from '../i18n';
import { useLoad } from '../store';
import { C, S } from '../theme';
import { Badge, Empty, Spinner, Status } from '../components/ui';

/** "منتجاتي" — the supplier's storefront with in-place price / quantity editing and photo upload. */
export default function MyProductsScreen() {
  const res = useLoad(() => api.get<Offer[]>('/suppliers/me/products'));
  const [q, setQ] = useState(''); const [saved, setSaved] = useState<number | null>(null);
  const patch = async (o: Offer, body: any) => { try { await api.patch(`/suppliers/me/offers/${o.id}`, body); setSaved(o.id); setTimeout(() => setSaved(null), 1500); res.reload(); } catch (e: any) { Alert.alert(t('error'), e.message); } };
  const pick = async (o: Offer) => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (r.canceled || !r.assets?.[0]) return;
    try { await upload(`/suppliers/me/offers/${o.id}/image`, r.assets[0].uri, r.assets[0].fileName || 'photo.jpg', r.assets[0].mimeType || 'image/jpeg'); res.reload(); } catch (e: any) { Alert.alert(t('error'), e.message); }
  };
  const rows = (res.data || []).filter(o => !q || nm(o.product!).includes(q) || (o.product?.sku || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={S.screen}>
      <View style={[S.pad, { paddingBottom: 0 }]}><TextInput style={S.input} placeholder={t('search')} value={q} onChangeText={setQ} /></View>
      {res.loading && !res.data ? <Spinner /> : (
        <FlatList data={rows} keyExtractor={o => String(o.id)} contentContainerStyle={S.pad} ListEmptyComponent={<Empty />}
          refreshControl={<RefreshControl refreshing={res.loading} onRefresh={res.reload} />}
          renderItem={({ item: o }) => (
            <View style={S.card}>
              <View style={[S.row, { alignItems: 'flex-start' }]}>
                <TouchableOpacity onPress={() => pick(o)}><Image source={{ uri: imageUrl(o.image_url || o.product?.image_url) }} style={{ width: 72, height: 72, borderRadius: 8, backgroundColor: C.soft }} /><Text style={[S.muted, { textAlign: 'center' }]}>📷 {t('upload_image')}</Text></TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={S.bold}>{nm(o.product!)}</Text>
                  <Text style={S.muted}>{o.product?.brand} · {o.product?.sku} · {o.unit || o.product?.unit} · {o.city}</Text>
                  <View style={[S.row, { marginTop: 4 }]}>{!!o.rental_period && <Badge text={t('rent') + ' ' + t('per_' + o.rental_period)} />}<Status s={o.available_qty != null && o.available_qty <= 0 ? 'out_of_stock' : o.stock_status} />{saved === o.id && <Text style={{ color: '#1E7D4F', fontWeight: '700' }}>{t('saved')}</Text>}</View>
                </View>
              </View>
              <View style={[S.row, { marginTop: 8 }]}>
                <View style={{ flex: 1 }}><Text style={S.label}>{t('price')} ({t('ex_vat')})</Text><TextInput style={[S.input, { marginBottom: 0 }]} keyboardType="decimal-pad" defaultValue={String(o.price_ex_vat)} onEndEditing={e => { const v = Number(e.nativeEvent.text); if (v > 0 && v !== o.price_ex_vat) patch(o, { price: v, includes_vat: false }); }} /></View>
                <View style={{ flex: 1 }}><Text style={S.label}>{t('available_qty')}</Text><TextInput style={[S.input, { marginBottom: 0 }]} keyboardType="numeric" placeholder="—" defaultValue={o.available_qty == null ? '' : String(o.available_qty)} onEndEditing={e => { const raw = e.nativeEvent.text.trim(); if (raw === '' && o.available_qty != null) patch(o, { clear_qty: true }); else if (raw !== '' && Number(raw) !== o.available_qty) patch(o, { available_qty: Number(raw) }); }} /></View>
                <View style={{ flex: 1 }}><Text style={S.label}>{t('min_qty')}</Text><TextInput style={[S.input, { marginBottom: 0 }]} keyboardType="numeric" defaultValue={String(o.min_qty)} onEndEditing={e => { const v = Number(e.nativeEvent.text); if (v > 0 && v !== o.min_qty) patch(o, { min_qty: v }); }} /></View>
              </View>
              <Text style={[S.muted, { marginTop: 6 }]}>{t('inc_vat')}: {money(o.price_inc_vat)}</Text>
            </View>
          )} />
      )}
    </View>
  );
}
