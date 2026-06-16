import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WaveformVisualizer } from "@/components/WaveformVisualizer";
import { useColors } from "@/hooks/useColors";
import { GENRES, useStudio } from "@/context/StudioContext";
import { CreationCard } from "@/components/CreationCard";

export default function StudioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { myCreations, deleteCreation } = useStudio();
  const [playingId, setPlayingId] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleDelete = (id: string, name: string) => {
    Alert.alert("Delete Creation", `Delete "${name}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (playingId === id) setPlayingId(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          deleteCreation(id);
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 100 }}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: topPad + 12 }]}>
          <View>
            <Text style={[styles.logo, { color: colors.primary }]}>BrainMash</Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>
              Turn Any Sound Into Music
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="settings" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroRing, { borderColor: colors.primary + "33" }]}>
            <View style={[styles.heroRingInner, { borderColor: colors.primary + "66" }]}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  router.push("/studio/record");
                }}
                style={({ pressed }) => [
                  styles.heroBtn,
                  { backgroundColor: colors.primary, shadowColor: colors.primary, transform: [{ scale: pressed ? 0.94 : 1 }] },
                ]}
              >
                <Feather name="mic" size={38} color="#fff" />
              </Pressable>
            </View>
          </View>
          <Text style={[styles.heroLabel, { color: colors.text }]}>Start Creating</Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            No musical knowledge required
          </Text>
          <Pressable
            onPress={() => router.push("/studio/record")}
            style={({ pressed }) => [styles.importRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="upload" size={14} color={colors.accent} />
            <Text style={[styles.importText, { color: colors.accent }]}>Import audio file</Text>
          </Pressable>
        </View>

        {/* Genre pills */}
        <Text style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: 20 }]}>5 Genres</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.genresRow}
        >
          {GENRES.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/studio/record"); }}
              style={({ pressed }) => [
                styles.genrePill,
                { backgroundColor: g.color + "22", borderColor: g.color + "55", opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name={g.icon as any} size={14} color={g.color} />
              <Text style={[styles.genrePillText, { color: g.color }]}>{g.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* My Creations */}
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>My Creations</Text>
          {myCreations.length > 0 && (
            <View style={[styles.countPill, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.countText, { color: colors.primary }]}>{myCreations.length}</Text>
            </View>
          )}
        </View>

        {myCreations.length === 0 ? (
          <>
            <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Feather name="music" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No creations yet</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Record or import a sound to generate your first track
              </Text>
            </View>
            <View style={[styles.waveTeaser, { opacity: 0.3 }]}>
              <WaveformVisualizer active color={colors.primary} barCount={52} height={40} seed={42} />
            </View>
          </>
        ) : (
          myCreations.map((c) => (
            <CreationCard
              key={c.id}
              creation={c}
              playing={playingId === c.id}
              onPlay={() => setPlayingId((p) => (p === c.id ? null : c.id))}
              onDelete={() => handleDelete(c.id, c.name)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingHorizontal: 20, paddingBottom: 12,
  },
  logo: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  tagline: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  hero: { alignItems: "center", paddingVertical: 36 },
  heroRing: {
    width: 150, height: 150, borderRadius: 75, borderWidth: 1,
    alignItems: "center", justifyContent: "center", marginBottom: 20,
  },
  heroRingInner: {
    width: 122, height: 122, borderRadius: 61, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  heroBtn: {
    width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center",
    shadowOpacity: 0.6, shadowRadius: 28, shadowOffset: { width: 0, height: 0 }, elevation: 14,
  },
  heroLabel: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 6 },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 12 },
  importRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  importText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 12 },
  sectionRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, marginBottom: 12, gap: 8,
  },
  genresRow: { paddingHorizontal: 20, gap: 8, marginBottom: 28 },
  genrePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  genrePillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  countPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  empty: {
    marginHorizontal: 20, borderRadius: 18, borderWidth: 1,
    padding: 32, alignItems: "center", gap: 8,
  },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 4 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  waveTeaser: { paddingHorizontal: 20, marginTop: 20 },
});
