import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import { t } from '../i18n';
import { useStore } from '../store';
import { C, S } from '../theme';
import { Btn } from '../components/ui';

export default function LoginScreen({ navigation, route }: any) {
  const { login, register } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>(route.params?.mode || 'login');
  const [role, setRole] = useState<'buyer' | 'supplier'>('buyer');
  const [f, setF] = useState({ email: '', password: '', full_name: '', company_name: '', city: 'الرياض', phone: '', otp_token: '' });
  const [otp, setOtp] = useState<{ sent?: string; debug?: string; code: string; done: boolean }>({ code: '', done: false });
  const sendOtp = async (purpose: 'register' | 'login') => { try { const r = await api.post<any>('/auth/otp/request', { destination: f.phone, purpose }); setOtp({ sent: r.destination, debug: r.debug_code, code: '', done: false }); } catch (e: any) { setErr(e.message); } };
  const verifyOtp = async (purpose: 'register' | 'login') => { try { const r = await api.post<any>('/auth/otp/verify', { destination: f.phone, code: otp.code, purpose }); if (purpose === 'login' && r.access_token) { const { setToken } = await import('../api'); await setToken(r.access_token); navigation.goBack(); return; } setF({ ...f, otp_token: r.verification_token, phone: r.destination }); setOtp({ ...otp, done: true }); } catch (e: any) { setErr(e.message); } };
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr('');
    try { mode === 'login' ? await login(f.email, f.password) : await register({ ...f, role }); navigation.goBack(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad}>
      <View style={{ alignItems: 'center', marginBottom: 14 }}><Text style={[S.h1, { marginBottom: 0 }]}>{t('brand')}</Text><Text style={{ color: C.primary2, fontWeight: '800', letterSpacing: 2 }}>BUILD FOR LESS</Text><Text style={S.muted}>{t('slogan_ar')}</Text></View>
      <View style={[S.row, { marginBottom: 12 }]}>
        {(['login', 'register'] as const).map(m => <TouchableOpacity key={m} onPress={() => setMode(m)} style={[S.btnGhost, { flex: 1 }, mode === m && { backgroundColor: C.primary }]}><Text style={[S.btnGhostText, mode === m && { color: '#fff' }]}>{t(m)}</Text></TouchableOpacity>)}
      </View>
      {err ? <Text style={S.error}>{err}</Text> : null}
      {mode === 'register' && (
        <>
          <View style={[S.row, { marginBottom: 10 }]}>{(['buyer', 'supplier'] as const).map(r => <TouchableOpacity key={r} onPress={() => setRole(r)} style={[S.btnGhost, { flex: 1 }, role === r && { backgroundColor: C.primary2 }]}><Text style={[S.btnGhostText, role === r && { color: '#fff' }]}>{t(r)}</Text></TouchableOpacity>)}</View>
          <Text style={S.label}>{t('full_name')}</Text><TextInput style={S.input} value={f.full_name} onChangeText={v => setF({ ...f, full_name: v })} />
          <Text style={S.label}>{t('company')}</Text><TextInput style={S.input} value={f.company_name} onChangeText={v => setF({ ...f, company_name: v })} />
          <Text style={S.label}>{t('city')}</Text><TextInput style={S.input} value={f.city} onChangeText={v => setF({ ...f, city: v })} />
          <Text style={S.label}>{t('phone')}</Text><TextInput style={S.input} keyboardType="phone-pad" value={f.phone} onChangeText={v => setF({ ...f, phone: v })} placeholder="05xxxxxxxx" />
          {f.phone.length >= 9 && !otp.done && (otp.sent ? (
            <View style={[S.row, { marginBottom: 10 }]}><TextInput style={[S.input, { flex: 1, marginBottom: 0 }]} keyboardType="number-pad" placeholder={t('otp_code') + (otp.debug ? ` (${otp.debug})` : '')} value={otp.code} onChangeText={v => setOtp({ ...otp, code: v })} /><Btn title={t('otp_verify')} onPress={() => verifyOtp('register')} /></View>
          ) : <Btn ghost title={t('otp_send')} onPress={() => sendOtp('register')} style={{ marginBottom: 10 }} />)}
          {otp.done && <Text style={S.ok}>{t('verified')}</Text>}
        </>
      )}
      {mode === 'login' && (
        <View style={{ marginBottom: 10 }}>
          <Text style={S.label}>{t('login_otp')}</Text>
          <View style={S.row}><TextInput style={[S.input, { flex: 1, marginBottom: 0 }]} keyboardType="phone-pad" placeholder="05xxxxxxxx" value={f.phone} onChangeText={v => setF({ ...f, phone: v })} />
            {otp.sent ? <><TextInput style={[S.input, { width: 90, marginBottom: 0 }]} keyboardType="number-pad" placeholder={otp.debug || '••••'} value={otp.code} onChangeText={v => setOtp({ ...otp, code: v })} /><Btn title={t('otp_verify')} onPress={() => verifyOtp('login')} /></> : <Btn ghost title={t('otp_send')} onPress={() => sendOtp('login')} disabled={f.phone.length < 9} />}</View>
        </View>
      )}
      <Text style={S.label}>{t('email')}</Text><TextInput style={S.input} autoCapitalize="none" keyboardType="email-address" value={f.email} onChangeText={v => setF({ ...f, email: v })} />
      <Text style={S.label}>{t('password')}</Text><TextInput style={S.input} secureTextEntry value={f.password} onChangeText={v => setF({ ...f, password: v })} />
      <Btn title={t(mode)} onPress={go} disabled={busy} />
      <Text style={[S.muted, { marginTop: 14, textAlign: 'center' }]}>{t('demo')}</Text>
    </ScrollView>
  );
}
