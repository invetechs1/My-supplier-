import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { api, Payout } from '../api';
import { lang, money, setLang, t } from '../i18n';
import { useLoad, useStore } from '../store';
import { S } from '../theme';
import { Btn, Stat } from '../components/ui';

export default function AccountScreen({ navigation }: any) {
  const { user, logout, unread } = useStore();
  const [, force] = useState(0);
  const dash = useLoad(() => user?.role === 'supplier' ? api.get<any>('/suppliers/me/dashboard') : Promise.resolve(null), [user?.id]);
  const fin = useLoad(() => user?.role === 'supplier' ? api.get<any>('/payments/supplier/summary') : Promise.resolve(null), [user?.id]);
  const payouts = useLoad(() => user?.role === 'supplier' ? api.get<Payout[]>('/payments/payouts/mine') : Promise.resolve([]), [user?.id]);
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
          {user.role === 'supplier' && fin.data && (
            <View style={[S.card, { marginTop: 12 }]}><Text style={S.h2}>{t('payouts')}</Text>
              <Text style={S.text}>{t('in_escrow')}: <Text style={S.bold}>{money(fin.data.in_escrow)}</Text> · {t('payouts_pending')}: <Text style={S.bold}>{money(fin.data.payouts_pending)}</Text></Text>
              {(payouts.data || []).slice(0, 5).map(x => <Text key={x.id} style={S.muted}>#{x.order_id} — {money(x.amount)} — {t(x.status)} {x.reference}</Text>)}
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
          <Text style={{ color: '#2E9E5B', fontWeight: '800', letterSpacing: 2, marginBottom: 12 }}>BUILD FOR LESS — {t('slogan_ar')}</Text>
          <Btn title={t('login')} onPress={() => navigation.navigate('Login')} style={{ marginBottom: 8 }} />
          <Btn title={t('register')} ghost onPress={() => navigation.navigate('Login', { mode: 'register' })} style={{ marginBottom: 8 }} />
        </>
      )}
      <Btn title={`🌐 ${t('language')}`} ghost onPress={() => { setLang(lang === 'ar' ? 'en' : 'ar'); force(x => x + 1); }} />
      <Text style={[S.muted, { marginTop: 20, textAlign: 'center' }]}>{t('brand')} · Build for Less · v1.1.0</Text>
    </ScrollView>
  );
}
