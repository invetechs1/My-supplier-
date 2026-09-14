import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { C, S } from '../theme';
import { t } from '../i18n';

export const Spinner = () => <View style={{ padding: 30, alignItems: 'center' }}><ActivityIndicator color={C.primary} /></View>;
export const Empty = ({ text }: { text?: string }) => <View style={[S.card, { alignItems: 'center' }]}><Text style={S.muted}>{text || t('no_data')}</Text></View>;
export const Btn = ({ title, onPress, ghost, disabled, style }: { title: string; onPress: () => void; ghost?: boolean; disabled?: boolean; style?: any }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} style={[ghost ? S.btnGhost : S.btn, disabled && { opacity: .5 }, style]}><Text style={ghost ? S.btnGhostText : S.btnText}>{title}</Text></TouchableOpacity>
);
const KIND: Record<string, [string, string]> = { open: [C.soft, C.primary], awarded: [C.soft, C.primary], delivered: [C.soft, C.primary], in_stock: [C.soft, C.primary], submitted: [C.infoSoft, C.info], confirmed: [C.infoSoft, C.info], in_delivery: [C.infoSoft, C.info], pending: [C.warnSoft, C.warn], limited: [C.warnSoft, C.warn], cancelled: [C.dangerSoft, C.danger], rejected: [C.dangerSoft, C.danger], out_of_stock: [C.dangerSoft, C.danger] };
export const Status = ({ s }: { s: string }) => { const [bg, fg] = KIND[s] || ['#F2F6F3', C.muted]; return <Text style={[S.badge, { backgroundColor: bg, color: fg }]}>{t(s)}</Text>; };
export const Badge = ({ text }: { text: string }) => <Text style={S.badge}>{text}</Text>;
export const Change = ({ pct }: { pct?: number | null }) => pct == null ? <Text style={S.muted}>—</Text> : <Text style={{ color: pct > 0 ? C.danger : pct < 0 ? '#1E7D4F' : C.muted, fontWeight: '700' }}>{pct > 0 ? '▲' : pct < 0 ? '▼' : ''} {Math.abs(pct).toFixed(1)}%</Text>;
export const Stat = ({ label, value }: { label: string; value: string | number }) => <View style={[S.card, { flex: 1, minWidth: 140 }]}><Text style={S.price}>{value}</Text><Text style={S.muted}>{label}</Text></View>;
