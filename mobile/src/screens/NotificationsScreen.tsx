import React from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { api, Notification } from '../api';
import { t } from '../i18n';
import { useLoad, useStore } from '../store';
import { C, S } from '../theme';
import { Btn, Empty, Spinner } from '../components/ui';

export default function NotificationsScreen({ navigation }: any) {
  const { refreshUnread } = useStore();
  const res = useLoad(() => api.get<Notification[]>('/notifications'));
  const open = async (n: Notification) => {
    await api.post(`/notifications/${n.id}/read`).catch(() => {}); refreshUnread();
    if (n.ref_type === 'rfq' && n.ref_id) navigation.navigate('RFQDetail', { id: n.ref_id }); else if (n.ref_type === 'order') navigation.navigate('Tabs', { screen: 'Orders' }); else res.reload();
  };
  if (res.loading && !res.data) return <Spinner />;
  return (
    <View style={S.screen}>
      <View style={S.pad}><Btn ghost title="✓ ✓" onPress={() => api.post('/notifications/read-all').then(() => { res.reload(); refreshUnread(); })} /></View>
      <FlatList data={res.data || []} keyExtractor={n => String(n.id)} contentContainerStyle={S.pad} ListEmptyComponent={<Empty />}
        renderItem={({ item: n }) => <TouchableOpacity style={[S.card, !n.is_read && { backgroundColor: C.soft }]} onPress={() => open(n)}><Text style={S.bold}>{n.title}</Text>{!!n.body && <Text style={S.text}>{n.body}</Text>}<Text style={S.muted}>{new Date(n.created_at + 'Z').toLocaleString()}</Text></TouchableOpacity>} />
    </View>
  );
}
