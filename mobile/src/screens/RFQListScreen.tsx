import React from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, RFQ } from '../api';
import { money, t } from '../i18n';
import { useLoad, useStore } from '../store';
import { S } from '../theme';
import { Btn, Empty, Spinner, Status } from '../components/ui';

export default function RFQListScreen({ navigation }: any) {
  const { user, quote } = useStore();
  const isSupplier = user?.role === 'supplier';
  const res = useLoad(() => user ? api.get<RFQ[]>(isSupplier ? '/rfq/open' : '/rfq/mine', isSupplier ? { size: 100 } : undefined) : Promise.resolve([]), [user?.id]);
  useFocusEffect(React.useCallback(() => { if (user) res.reload(); }, [user?.id])); // eslint-disable-line
  if (!user) return <View style={[S.screen, S.pad]}><Empty text={t('login')} /><Btn title={t('login')} onPress={() => navigation.navigate('Login')} /></View>;
  return (
    <View style={S.screen}>
      {!isSupplier && <View style={S.pad}><Btn title={`➕ ${t('new_rfq')}${quote.length ? ` (${quote.length})` : ''}`} onPress={() => navigation.navigate('NewRFQ')} /></View>}
      {res.loading && !res.data ? <Spinner /> : (
        <FlatList data={res.data || []} keyExtractor={r => String(r.id)} contentContainerStyle={S.pad} ListEmptyComponent={<Empty />}
          refreshControl={<RefreshControl refreshing={res.loading} onRefresh={res.reload} />}
          renderItem={({ item: r }) => (
            <TouchableOpacity style={S.card} onPress={() => navigation.navigate('RFQDetail', { id: r.id })}>
              <View style={[S.row, S.between]}><Text style={S.bold}>{r.title}</Text><Status s={r.status} /></View>
              <Text style={S.muted}>#{r.id} · {r.city} · {r.items.length} {t('items')} · {r.bid_count} {t('bids')}{isSupplier && r.buyer_name ? ` · ${r.buyer_name}` : ''}</Text>
              {isSupplier ? (r.my_bid ? <Text style={S.text}>{t('my_bid')}: {money(r.my_bid.total)} <Status s={r.my_bid.status} /></Text> : <Text style={[S.btnGhostText, { marginTop: 4 }]}>{t('submit_bid')} →</Text>)
                : r.best_total != null && <Text style={S.text}>{t('best_total')}: <Text style={S.bold}>{money(r.best_total)}</Text></Text>}
            </TouchableOpacity>
          )} />
      )}
    </View>
  );
}
