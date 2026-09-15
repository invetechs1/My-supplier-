import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { reportClientError } from "@/lib/errorReporting";
import { colors, spacing, typography } from "@/theme";
import { Button } from "./Button";

interface Props {
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render errors anywhere under the root Stack, reports them to the
 * API and shows a retry screen instead of a blank app.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportClientError(
      new Error(`${error.message}\nComponent stack:${info.componentStack ?? ""}`, { cause: error }),
      "render",
    );
  }

  retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>The screen could not be shown. You can try again; if it keeps happening, restart the app.</Text>
        {__DEV__ ? (
          <Text style={styles.detail} numberOfLines={6}>
            {this.state.error.message}
          </Text>
        ) : null}
        <Button title="Try again" icon="refresh-outline" onPress={this.retry} size="lg" style={{ marginTop: spacing.xl, minWidth: 180 }} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.background },
  title: { ...typography.h2, marginTop: spacing.lg, textAlign: "center" },
  message: { ...typography.bodySmall, marginTop: spacing.sm, textAlign: "center", maxWidth: 320 },
  detail: { ...typography.caption, marginTop: spacing.md, textAlign: "center", fontFamily: "monospace", color: colors.danger, maxWidth: 340 },
});
