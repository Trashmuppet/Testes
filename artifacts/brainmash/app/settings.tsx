import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useStudio } from "@/context/StudioContext";

interface RowProps {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  destructive?: boolean;
  rightLabel?: string;
}

function SettingsRow({ icon, label, sublabel, onPress, destructive, rightLabel }: RowProps) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: destructive ? colors.hot + "22" : colors.primary + "22" }]}>
        <Feather
          name={icon as any}
          size={18}
          color={destructive ? colors.hot : colors.primary}
        />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: destructive ? colors.hot : colors.text }]}>{label}</Text>
        {sublabel && (
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sublabel}</Text>
        )}
      </View>
      {rightLabel ? (
        <Text style={[styles.rightLabel, { color: colors.mutedForeground }]}>{rightLabel}</Text>
      ) : (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      )}
    </Pressable>
  );
}

function SectionLabel({ title }: { title: string }) {
  const colors = useColors();
  return <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{title}</Text>;
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { myCreations, clearAll } = useStudio();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleClearAll = () => {
    if (myCreations.length === 0) {
      Alert.alert("No Creations", "You don't have any saved creations to clear.");
      return;
    }
    Alert.alert(
      "Clear All Creations",
      `This will permanently delete all ${myCreations.length} creation${myCreations.length !== 1 ? "s" : ""}. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            clearAll();
          },
        },
      ]
    );
  };

  const handleContact = () => {
    Linking.openURL("mailto:support@brainmash.app?subject=BrainMash%20Support").catch(() => {
      Alert.alert("Contact Support", "Reach us at support@brainmash.app");
    });
  };

  const handleRate = () => {
    Alert.alert("Rate BrainMash", "Thanks for the support! Rating will be available once the app is live on the App Store.");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.nav, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="arrow-left" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad + 32 }}
      >
        <SectionLabel title="App" />
        <View style={[styles.group, { borderColor: colors.cardBorder }]}>
          <SettingsRow
            icon="star"
            label="Rate BrainMash"
            sublabel="Love the app? Leave a review"
            onPress={handleRate}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon="mail"
            label="Contact Support"
            sublabel="support@brainmash.app"
            onPress={handleContact}
          />
        </View>

        <SectionLabel title="Data" />
        <View style={[styles.group, { borderColor: colors.cardBorder }]}>
          <SettingsRow
            icon="database"
            label="Creations"
            onPress={() => {}}
            rightLabel={`${myCreations.length} saved`}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingsRow
            icon="trash-2"
            label="Clear All Creations"
            sublabel="Permanently delete all saved audio"
            onPress={handleClearAll}
            destructive
          />
        </View>

        <SectionLabel title="About" />
        <View style={[styles.group, { borderColor: colors.cardBorder }]}>
          <SettingsRow
            icon="info"
            label="Version"
            onPress={() => {}}
            rightLabel="1.0.0"
          />
        </View>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          BrainMash — Turn any sound into music{"\n"}
          Made with 🎛️ and ☕
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  group: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  rightLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  divider: { height: 1, marginLeft: 66 },
  footer: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginTop: 32,
    paddingHorizontal: 20,
  },
});
