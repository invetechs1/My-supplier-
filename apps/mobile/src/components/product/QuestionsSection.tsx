import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ProductQuestion } from "@mysupplier/shared";
import { api, getErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { useApi } from "@/hooks/useApi";
import { colors, radius, spacing, typography } from "@/theme";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { Card, SectionHeader } from "../Card";
import { TextField } from "../TextField";

interface Props {
  materialId: string;
  questionsCount: number;
}

/** Product Q&A: answered-first list plus an "ask a question" sheet (auth). */
export function QuestionsSection({ materialId, questionsCount }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { showToast } = useCart();
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [extra, setExtra] = useState<ProductQuestion[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const questions = useApi(() => api.productQuestions(materialId, 1), [materialId]);

  const list = [...(questions.data?.data ?? []), ...extra];
  const total = questions.data?.total ?? questionsCount;
  const hasMore = list.length < total;

  const ask = () => {
    if (!isAuthenticated) return router.push("/(auth)/login");
    setAskOpen(true);
  };

  const submit = async () => {
    const q = question.trim();
    if (q.length < 5) return setError(t("yourQuestion"));
    setBusy(true);
    setError(null);
    try {
      await api.askProductQuestion(materialId, q);
      setQuestion("");
      setAskOpen(false);
      showToast(t("questionSent"));
      setExtra([]);
      setPage(1);
      questions.reload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await api.productQuestions(materialId, page + 1);
      setExtra((prev) => [...prev, ...res.data]);
      setPage(page + 1);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <View>
      <SectionHeader title={`${t("questionsAnswers")}${total ? ` (${total})` : ""}`} actionTitle={t("askQuestion")} onAction={ask} />
      <Card>
        {questions.loading && !questions.data ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : null}
        {!questions.loading && list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="help-circle-outline" size={28} color={colors.textMuted} />
            <Text style={[typography.body, { fontWeight: "600", marginTop: spacing.xs }]}>{t("noQuestionsYet")}</Text>
            <Text style={[typography.caption, { textAlign: "center" }]}>{t("beFirstQuestion")}</Text>
            <Button title={t("askQuestion")} size="sm" variant="secondary" onPress={ask} style={{ marginTop: spacing.md }} />
          </View>
        ) : null}
        {list.map((q, i) => (
          <View key={q.id} style={[styles.item, i > 0 && styles.itemBorder]}>
            <View style={styles.line}>
              <Text style={styles.q}>Q</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.question}>{q.question}</Text>
                <Text style={typography.caption}>
                  {q.user?.name ?? "—"} · {formatDate(q.createdAt)}
                </Text>
              </View>
            </View>
            {q.answer ? (
              <View style={[styles.line, styles.answer]}>
                <Text style={[styles.q, { color: colors.primary }]}>A</Text>
                <View style={{ flex: 1 }}>
                  <Text style={typography.bodySmall}>{q.answer}</Text>
                  <Text style={typography.caption}>
                    {q.answeredBy?.companyName ?? q.answeredBy?.name ?? t("answer")}
                    {q.answeredAt ? ` · ${formatDate(q.answeredAt)}` : ""}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={[typography.caption, { marginTop: 4, marginLeft: 26, fontStyle: "italic" }]}>{t("awaitingAnswer")}</Text>
            )}
          </View>
        ))}
        {hasMore ? <Button title={t("seeMore")} variant="ghost" size="sm" loading={loadingMore} onPress={() => void loadMore()} style={{ marginTop: spacing.sm }} /> : null}
      </Card>

      <BottomSheet visible={askOpen} onClose={() => setAskOpen(false)} title={t("askQuestion")}>
        <TextField label={t("yourQuestion")} value={question} onChangeText={setQuestion} placeholder={t("questionPlaceholder")} multiline maxLength={500} autoFocus />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title={t("send")} icon="send-outline" size="lg" fullWidth loading={busy} disabled={question.trim().length < 5} onPress={() => void submit()} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", paddingVertical: spacing.md },
  item: { paddingVertical: spacing.sm },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  line: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  q: { width: 18, fontSize: 14, fontWeight: "800", color: colors.textSecondary },
  question: { ...typography.body, fontWeight: "600" },
  answer: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.primaryLight },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.sm },
});
