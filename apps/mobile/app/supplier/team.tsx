import React, { useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { CompanyInvite, CompanyRole, TeamMember } from "@mysupplier/shared";
import { Screen, Button, Card, SectionHeader, TextField, PickerField, PickerModal, LoadingView, ErrorView, EmptyState, RequireAuth, type PickerOption } from "@/components";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatDate, timeAgo } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";

const ROLE_OPTIONS: PickerOption<CompanyRole>[] = [
  { value: "OWNER", label: "Owner", subtitle: "Full access, billing and team" },
  { value: "MANAGER", label: "Manager", subtitle: "Everything except ownership transfer" },
  { value: "SALES", label: "Sales", subtitle: "Prices, catalogue, bids, orders, messages" },
  { value: "WAREHOUSE", label: "Warehouse", subtitle: "Inventory and order status" },
];

const ROLE_COLOR: Record<CompanyRole, { bg: string; fg: string }> = {
  OWNER: { bg: colors.primaryLight, fg: colors.primary },
  MANAGER: { bg: colors.infoLight, fg: colors.info },
  SALES: { bg: colors.accentLight, fg: "#B07A00" },
  WAREHOUSE: { bg: colors.purpleLight, fg: colors.purple },
};

function roleLabel(role: CompanyRole): string {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

function TeamContent() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, loading, error, refreshing, reload, refresh, setData } = useApi(() => api.team(), []);
  const [rolePicker, setRolePicker] = useState<{ member: TeamMember } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyRole>("SALES");
  const [inviteRoleOpen, setInviteRoleOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const patchMember = async (member: TeamMember, patch: { role?: CompanyRole; active?: boolean }) => {
    setBusyId(member.id);
    try {
      const updated = await api.updateMember(member.id, patch);
      setData((prev) => (prev ? { ...prev, members: prev.members.map((m) => (m.id === member.id ? { ...m, ...updated } : m)) } : prev));
    } catch (err) {
      Alert.alert("Could not update member", getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = (member: TeamMember, active: boolean) => {
    if (!active) {
      Alert.alert("Deactivate member", `${member.name} will no longer be able to log in to ${user?.company?.name ?? "the company"}.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: () => patchMember(member, { active: false }) },
      ]);
      return;
    }
    patchMember(member, { active: true });
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError("Enter a valid email address");
      return;
    }
    setInviteError(null);
    setInviting(true);
    try {
      const invite = await api.inviteMember({ email, role: inviteRole, name: inviteName.trim() || undefined });
      setData((prev) => (prev ? { ...prev, invites: [invite, ...prev.invites.filter((i) => i.id !== invite.id)] } : prev));
      setInviteEmail("");
      setInviteName("");
      Alert.alert("Invitation sent", `${email} received a link to join as ${roleLabel(inviteRole)}. It expires in 7 days.`);
    } catch (err) {
      setInviteError(getErrorMessage(err));
    } finally {
      setInviting(false);
    }
  };

  const cancelInvite = (invite: CompanyInvite) => {
    Alert.alert("Cancel invitation", `Cancel the invitation for ${invite.email}?`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel invite",
        style: "destructive",
        onPress: async () => {
          setCancelling(invite.id);
          try {
            await api.cancelInvite(invite.id);
            setData((prev) => (prev ? { ...prev, invites: prev.invites.filter((i) => i.id !== invite.id) } : prev));
          } catch (err) {
            Alert.alert("Error", getErrorMessage(err));
          } finally {
            setCancelling(null);
          }
        },
      },
    ]);
  };

  if (loading && !data) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (error && !data) {
    return (
      <Screen>
        <ErrorView message={error} onRetry={reload} />
      </Screen>
    );
  }

  const members = data?.members ?? [];
  const invites = (data?.invites ?? []).filter((i) => !i.acceptedAt);

  return (
    <Screen scroll keyboard refreshing={refreshing} onRefresh={refresh} edges={["bottom", "left", "right"]}>
      <SectionHeader title={`Members (${members.length})`} />
      {members.length ? (
        <Card style={{ paddingVertical: spacing.xs }}>
          {members.map((m, i) => {
            const isMe = m.id === user?.id;
            const rc = ROLE_COLOR[m.companyRole] ?? ROLE_COLOR.SALES;
            return (
              <View key={m.id} style={[styles.member, i > 0 && styles.memberBorder, !m.active && { opacity: 0.55 }]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(m.name || m.email).slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {m.name || m.email}
                    {isMe ? " (you)" : ""}
                  </Text>
                  <Text style={typography.caption} numberOfLines={1}>
                    {m.email}
                    {m.lastLoginAt ? ` · active ${timeAgo(m.lastLoginAt)}` : ` · joined ${formatDate(m.createdAt)}`}
                  </Text>
                  <Pressable onPress={() => !isMe && setRolePicker({ member: m })} disabled={isMe || busyId === m.id} style={[styles.rolePill, { backgroundColor: rc.bg }]}>
                    <Text style={[styles.rolePillText, { color: rc.fg }]}>{roleLabel(m.companyRole)}</Text>
                    {!isMe ? <Ionicons name="chevron-down" size={12} color={rc.fg} /> : null}
                  </Pressable>
                </View>
                <Switch value={m.active} onValueChange={(v) => toggleActive(m, v)} disabled={isMe || busyId === m.id} trackColor={{ true: colors.primary }} thumbColor="#fff" />
              </View>
            );
          })}
        </Card>
      ) : (
        <EmptyState icon="people-outline" title="No team members" message="Invite colleagues to manage prices, orders and inventory with you." style={{ minHeight: 120 }} />
      )}

      <SectionHeader title={`${t("invite")} a colleague`} />
      <Card>
        <TextField label="Email" value={inviteEmail} onChangeText={setInviteEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="name@company.com" error={inviteError} />
        <TextField label="Name (optional)" value={inviteName} onChangeText={setInviteName} placeholder="Full name" />
        <PickerField label="Role" value={roleLabel(inviteRole)} onPress={() => setInviteRoleOpen(true)} />
        <Text style={[typography.caption, { marginBottom: spacing.md }]}>{ROLE_OPTIONS.find((o) => o.value === inviteRole)?.subtitle}</Text>
        <Button title="Send invitation" icon="mail-outline" loading={inviting} onPress={sendInvite} fullWidth />
      </Card>

      {invites.length ? (
        <>
          <SectionHeader title={`Pending invitations (${invites.length})`} />
          <Card style={{ paddingVertical: spacing.xs }}>
            {invites.map((inv, i) => (
              <View key={inv.id} style={[styles.member, i > 0 && styles.memberBorder]}>
                <View style={[styles.avatar, { backgroundColor: colors.neutralLight }]}>
                  <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {inv.email}
                  </Text>
                  <Text style={typography.caption}>
                    {roleLabel(inv.role)} · expires {formatDate(inv.expiresAt)}
                    {inv.invitedBy?.name ? ` · by ${inv.invitedBy.name}` : ""}
                  </Text>
                </View>
                <Button title="Cancel" size="sm" variant="ghost" loading={cancelling === inv.id} onPress={() => cancelInvite(inv)} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <PickerModal
        visible={rolePicker !== null}
        title={rolePicker ? `Role for ${rolePicker.member.name || rolePicker.member.email}` : "Role"}
        options={ROLE_OPTIONS}
        value={rolePicker?.member.companyRole}
        onSelect={(role) => {
          if (rolePicker && role !== rolePicker.member.companyRole) patchMember(rolePicker.member, { role });
        }}
        onClose={() => setRolePicker(null)}
      />
      <PickerModal visible={inviteRoleOpen} title="Invite as" options={ROLE_OPTIONS} value={inviteRole} onSelect={setInviteRole} onClose={() => setInviteRoleOpen(false)} />
    </Screen>
  );
}

function TeamGate() {
  const { canManageCompany } = useAuth();
  const router = useRouter();
  if (!canManageCompany) {
    return (
      <Screen>
        <EmptyState icon="lock-closed-outline" title="Owners and managers only" message="Ask a company owner to grant you the MANAGER role to manage the team." actionTitle="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }
  return <TeamContent />;
}

export default function SupplierTeamScreen() {
  return (
    <RequireAuth roles={["SUPPLIER"]} message="Team management is available to supplier accounts.">
      <TeamGate />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  member: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  memberBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  memberName: { ...typography.body, fontWeight: "600" },
  rolePill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginTop: 4 },
  rolePillText: { fontSize: 11, fontWeight: "700" },
});
