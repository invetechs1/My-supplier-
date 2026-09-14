import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, Product } from '../api';
import { nm, t } from '../i18n';
import { useStore } from '../store';
import { C, S } from '../theme';
import { Btn } from '../components/ui';

export default function NewRFQScreen({ navigation }: any) {
  const { user, quote, addQuote, removeQuote, setQty, clearQuote } = useStore();
  const [title, setTitle] = useState(''); const [city, setCity] = useState(user?.city || 'الرياض'); const [addr, setAddr] = useState('');
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Product[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!q.trim()) { setHits([]); return; } const h = setTimeout(() => api.get<any>('/catalog/products', { q, size: 6 }).then(r => setHits(r.items)).catch(() => {}), 300); return () => clearTimeout(h); }, [q]);
  const submit = async () => {
    if (!user) return navigation.navigate('Login');
    setBusy(true);
    try {
      const r = await api.post<any>('/rfq', { title, city, delivery_address: addr, items: quote.map(i => ({ product_id: i.product_id, description: nm(i), quantity: i.quantity, unit: i.unit })) });
      clearQuote(); navigation.replace('RFQDetail', { id: r.id });
    } catch (e: any) { Alert.alert(t('error'), e.message); } finally { setBusy(false); }
  };
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad} keyboardShouldPersistTaps="handled">
      <Text style={S.label}>{t('title')}</Text><TextInput style={S.input} value={title} onChangeText={setTitle} />
      <View style={S.row}><View style={{ flex: 1 }}><Text style={S.label}>{t('city')}</Text><TextInput style={S.input} value={city} onChangeText={setCity} /></View></View>
      <TextInput style={S.input} placeholder={t('search')} value={q} onChangeText={setQ} />
      {hits.map(h => <TouchableOpacity key={h.id} style={[S.card, { paddingVertical: 8 }]} onPress={() => { addQuote(h); setQ(''); setHits([]); }}><Text style={S.text}>+ {nm(h)} <Text style={S.muted}>{h.brand} · {h.unit}</Text></Text></TouchableOpacity>)}
      <Text style={[S.h2, { marginTop: 8 }]}>{t('items')} ({quote.length})</Text>
      {quote.map(i => (
        <View key={i.product_id} style={[S.card, S.row, S.between]}>
          <View style={{ flex: 1 }}><Text style={S.bold}>{nm(i)}</Text><Text style={S.muted}>{i.unit}</Text></View>
          <TextInput style={[S.input, { width: 80, marginBottom: 0 }]} keyboardType="numeric" value={String(i.quantity)} onChangeText={v => setQty(i.product_id, Number(v) || 0)} />
          <TouchableOpacity onPress={() => removeQuote(i.product_id)}><Text style={{ color: C.danger, fontSize: 18, padding: 6 }}>✕</Text></TouchableOpacity>
        </View>
      ))}
      <Btn title={t('send')} onPress={submit} disabled={busy || !title.trim() || quote.length === 0} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}
