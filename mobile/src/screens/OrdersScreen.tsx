import React, { useState } from 'react';
import { Alert, FlatList, Linking, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, Order, Payment } from '../api';
import { money, t } from '../i18n';
import { useLoad, useStore } from '../store';
import { S } from '../theme';
import { Btn, Empty, Spinner, Status } from '../components/ui';
import { C } from '../theme';
const METHODS = ['mada', 'card', 'applepay', 'stcpay', 'bank_transfer'];

const NEXT: Record<string, string[]> = { pending: ['confirmed', 'cancelled'], confirmed: ['in_delivery', 'cancelled'], in_delivery: ['delivered'] };

export default function OrdersScreen({ navigation }: any) {
  const { user } = useStore();
  const isSupplier = user?.role === 'supplier';
  const res = useLoad(() => user ? api.get<Order[]>(isSupplier ? '/orders/supplier' : '/orders/mine') : Promise.resolve([]), [user?.id]);
  useFocusEffect(React.useCallback(() => { if (user) res.reload(); }, [user?.id])); // eslint-disable-line
  if (!user) return <View style={[S.screen, S.pad]}><Empty text={t('login')} /><Btn title={t('login')} onPress={() => navigation.navigate('Login')} /></View>;
  const move = async (o: Order, status: string) => { try { await api.patch(`/orders/${o.id}/status`, { status }); res.reload(); } catch (e: any) { Alert.alert(t('error'), e.message); } };
  const [paying, setPaying] = useState<number | null>(null);
  const pay = async (o: Order, method: string) => {
    try {
      const p = await api.post<Payment>('/payments/checkout', { order_id: o.id, method });
      setPaying(null);
      if (p.method === 'bank_transfer') Alert.alert(t('bank_transfer'), p.bank_instructions);
      else if (p.checkout_url) await Linking.openURL(p.checkout_url);
      res.reload();
    } catch (e: any) { Alert.alert(t('error'), e.message); }
  };
  const canPay = (o: Order) => !isSupplier && !['cancelled', 'delivered'].includes(o.status) && ['unpaid', 'pending'].includes(o.payment_status);
  return (
    <View style={S.screen}>
      {res.loading && !res.data ? <Spinner /> : (
        <FlatList data={res.data || []} keyExtractor={o => String(o.id)} contentContainerStyle={S.pad} ListEmptyComponent={<Empty />}
          refreshControl={<RefreshControl refreshing={res.loading} onRefresh={res.reload} />}
          renderItem={({ item: o }) => (
            <View style={S.card}>
              <View style={[S.row, S.between]}><Text style={S.bold}>#{o.id} · {isSupplier ? o.buyer_name : o.supplier?.name}</Text><View style={S.row}><Status s={o.status} /><Status s={o.payment_status} /></View></View>
              {o.items.map((i, idx) => <Text key={idx} style={S.muted}>{i.description} × {i.quantity} {i.unit} — {money(i.unit_price)}</Text>)}
              {!!o.delivery_address && <Text style={S.muted}>📍 {o.delivery_address}</Text>}
              {(o.events || []).length > 0 && <View style={{ marginTop: 4 }}><Text style={[S.muted, { fontWeight: '700' }]}>🚚 {t('timeline')}</Text>{o.events!.map(e => <Text key={e.id} style={S.muted}>● {t(e.status)} — {new Date(e.created_at.endsWith('Z') ? e.created_at : e.created_at + 'Z').toLocaleDateString('en-GB')}{e.note ? ` — ${e.note}` : ''}</Text>)}</View>}
              <View style={[S.row, S.between, { marginTop: 6 }]}>
                <Text style={S.price}>{money(o.total)}</Text>
                <View style={S.row}>{canPay(o) && <Btn title={'💳 ' + t('pay_now')} onPress={() => setPaying(paying === o.id ? null : o.id)} />}{(isSupplier ? NEXT[o.status] || [] : o.status === 'pending' ? ['cancelled'] : []).map(s => <Btn key={s} ghost title={t(s)} onPress={() => move(o, s)} />)}</View>
              </View>
              {paying === o.id && <View style={{ marginTop: 8 }}><Text style={S.label}>{t('choose_method')}</Text><View style={[S.row, { flexWrap: 'wrap' }]}>{METHODS.map(m => <TouchableOpacity key={m} style={[S.btnGhost, { borderWidth: 1, borderColor: C.line }]} onPress={() => pay(o, m)}><Text style={S.btnGhostText}>{t(m)}</Text></TouchableOpacity>)}</View><Text style={S.muted}>{t('escrow_note')}</Text></View>}
            </View>
          )} />
      )}
    </View>
  );
}
