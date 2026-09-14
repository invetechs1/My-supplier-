import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import { lang, money, setLang, t } from '../i18n';
import { useLoad, useStore } from '../store';
import { S } from '../theme';
import { Btn, Stat } from '../components/ui';

export default function AccountScreen({ navigation }: any) {
  const { user, logout, unread } = useStore();
  const [, force] = useState(0);
  const dash = useLoad(() => user?.role === 'supplier' ? api.get<any>('/suppliers/me/dashboard') : Promise.resolve(null), [user?.id]);
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad}>
      {user ? (
        <>
          <Text style={S.h1}>{user.company_name || user.full_name}</Text>
          <Text style={S.muted}>{user.email} · {t(user.role)} · {user.city}</Text>
          {user.role === 'supplier' && dash.data && (
            <View style={[S.row, { flexWrap: 'wrap', marginTop: 12 }]}>
              <Stat label={t('price_list')} value={dash.data.offers} /><Stat label={t('bids')} value={dash.data.bids} />
              <Stat label={t('orders')} value={dash.data.orders} /><Stat label={t('total')} value={money(dash.data.revenue, 0)} />
            </View>
          )}
          <View style={{ height: 12 }} />
          <Btn title={`🔔 ${t('notifications')}${unread ? ` (${unread})` : ''}`} ghost onPress={() => navigation.navigate('Notifications')} style={{ marginBottom: 8 }} />
          {user.role === 'supplier' && <Btn title={`🏷️ ${t('price_list')}`} ghost onPress={() => navigation.navigate('PriceList')} style={{ marginBottom: 8 }} />}
          <Btn title={t('logout')} ghost onPress={logout} style={{ marginBottom: 8 }} />
        </>
      ) : (
        <>
          <Text style={S.h1}>{t('brand')}</Text>
          <Btn title={t('login')} onPress={() => navigation.navigate('Login')} style={{ marginBottom: 8 }} />
          <Btn title={t('register')} ghost onPress={() => navigation.navigate('Login', { mode: 'register' })} style={{ marginBottom: 8 }} />
        </>
      )}
      <Btn title={`🌐 ${t('language')}`} ghost onPress={() => { setLang(lang === 'ar' ? 'en' : 'ar'); force(x => x + 1); }} />
      <Text style={[S.muted, { marginTop: 20, textAlign: 'center' }]}>v1.0.0</Text>
    </ScrollView>
  );
}
