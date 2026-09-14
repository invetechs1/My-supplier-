import React from 'react';
import { Alert, FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, Order } from '../api';
import { money, t } from '../i18n';
import { useLoad, useStore } from '../store';
import { S } from '../theme';
import { Btn, Empty, Spinner, Status } from '../components/ui';

const NEXT: Record<string, string[]> = { pending: ['confirmed', 'cancelled'], confirmed: ['in_delivery', 'cancelled'], in_delivery: ['delivered'] };

export default function OrdersScreen({ navigation }: any) {
  const { user } = useStore();
  const isSupplier = user?.role === 'supplier';
  const res = useLoad(() => user ? api.get<Order[]>(isSupplier ? '/orders/supplier' : '/orders/mine') : Promise.resolve([]), [user?.id]);
  useFocusEffect(React.useCallback(() => { if (user) res.reload(); }, [user?.id])); // eslint-disable-line
  if (!user) return <View style={[S.screen, S.pad]}><Empty text={t('login')} /><Btn title={t('login')} onPress={() => navigation.navigate('Login')} /></View>;
  const move = async (o: Order, status: string) => { try { await api.patch(`/orders/${o.id}/status`, { status }); res.reload(); } catch (e: any) { Alert.alert(t('error'), e.message); } };
  return (
    <View style={S.screen}>
      {res.loading && !res.data ? <Spinner /> : (
        <FlatList data={res.data || []} keyExtractor={o => String(o.id)} contentContainerStyle={S.pad} ListEmptyComponent={<Empty />}
          refreshControl={<RefreshControl refreshing={res.loading} onRefresh={res.reload} />}
          renderItem={({ item: o }) => (
            <View style={S.card}>
              <View style={[S.row, S.between]}><Text style={S.bold}>#{o.id} · {isSupplier ? o.buyer_name : o.supplier?.name}</Text><Status s={o.status} /></View>
              {o.items.map((i, idx) => <Text key={idx} style={S.muted}>{i.description} × {i.quantity} {i.unit} — {money(i.unit_price)}</Text>)}
              <View style={[S.row, S.between, { marginTop: 6 }]}>
                <Text style={S.price}>{money(o.total)}</Text>
                <View style={S.row}>{(isSupplier ? NEXT[o.status] || [] : o.status === 'pending' ? ['cancelled'] : []).map(s => <Btn key={s} ghost title={t(s)} onPress={() => move(o, s)} />)}</View>
              </View>
            </View>
          )} />
      )}
    </View>
  );
}
