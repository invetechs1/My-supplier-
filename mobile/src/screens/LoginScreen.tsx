import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { t } from '../i18n';
import { useStore } from '../store';
import { C, S } from '../theme';
import { Btn } from '../components/ui';

export default function LoginScreen({ navigation, route }: any) {
  const { login, register } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>(route.params?.mode || 'login');
  const [role, setRole] = useState<'buyer' | 'supplier'>('buyer');
  const [f, setF] = useState({ email: '', password: '', full_name: '', company_name: '', city: 'الرياض' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr('');
    try { mode === 'login' ? await login(f.email, f.password) : await register({ ...f, role }); navigation.goBack(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <ScrollView style={S.screen} contentContainerStyle={S.pad}>
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
        </>
      )}
      <Text style={S.label}>{t('email')}</Text><TextInput style={S.input} autoCapitalize="none" keyboardType="email-address" value={f.email} onChangeText={v => setF({ ...f, email: v })} />
      <Text style={S.label}>{t('password')}</Text><TextInput style={S.input} secureTextEntry value={f.password} onChangeText={v => setF({ ...f, password: v })} />
      <Btn title={t(mode)} onPress={go} disabled={busy} />
      <Text style={[S.muted, { marginTop: 14, textAlign: 'center' }]}>{t('demo')}</Text>
    </ScrollView>
  );
}
