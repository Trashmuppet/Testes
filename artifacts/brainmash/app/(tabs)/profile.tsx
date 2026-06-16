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

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { myCreations, deleteCreation } = useStudio();
  const [playingId, setPlayingId] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const totalLikes = myCreations.reduce((sum, c) => sum + c.likes, 0);
  const totalDuration = myCreations.reduce((sum, c) => sum + c.duration, 0);

  const formatDuration = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

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
        <View style={[styles.header, { paddingTop: topPad + 12 }]}>
          <Text style={[styles.title, { color: colors.text }]}>Profile</Text>
          <Pressable
            onPress={() => router.push("/settings")}
            style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="settings" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Avatar */}
        <View style={styles.profileSection}>
          <View style={[styles.avatarLarge, { backgroundColor: colors.primary + "33" }]}>
            <Text style={[styles.avatarChar, { color: colors.primary }]}>B</Text>
          </View>
          <Text style={[styles.username, { color: colors.text }]}>BrainMasher</Text>
          {myCreations.length > 0 && (
            <Text style={[styles.joinDate, { color: colors.mutedForeground }]}>
              First creation {new Date(myCreations[myCreations.length - 1].createdAt).toLocaleDateString()}
            </Text>
          )}
        </View>

        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: colors.primary }]}>{myCreations.length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Tracks</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: colors.accent }]}>{totalLikes}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Likes</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: colors.hot }]}>{formatDuration(totalDuration)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Generated</Text>
          </View>
        </View>

        {/* My Creations */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>My Tracks</Text>
          {myCreations.length > 0 && (
            <View style={[styles.countPill, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.countText, { color: colors.primary }]}>{myCreations.length}</Text>
            </View>
          )}
        </View>

        {myCreations.length === 0 ? (
          <Pressable
            onPress={() => router.push("/studio/record")}
            style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          >
            <Feather name="plus-circle" size={28} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Generate your first track</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Tap to start recording
            </Text>
          </Pressable>
        ) : (
          <View style={styles.grid}>
            {myCreations.map((c) => {
              const genre = GENRES.find((g) => g.id === c.genre)!;
              const isPlaying = playingId === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setPlayingId((prev) => (prev === c.id ? null : c.id))}
                  onLongPress={() => handleDelete(c.id, c.name)}
                  style={({ pressed }) => [
                    styles.gridItem,
                    {
                      backgroundColor: colors.card,
                      borderColor: isPlaying ? genre.color : colors.cardBorder,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <View style={styles.gridTop}>
                    <View style={[styles.gridDot, { backgroundColor: genre.color }]} />
                    <Text style={[styles.gridDur, { color: colors.mutedForeground }]}>{c.duration}s</Text>
                    <Feather name={isPlaying ? "pause" : "play"} size={14} color={genre.color} />
                  </View>
                  <WaveformVisualizer
                    active={isPlaying}
                    color={genre.color}
                    barCount={20}
                    height={32}
                    seed={c.waveformSeed}
                  />
                  <Text style={[styles.gridName, { color: colors.text }]} numberOfLines={1}>{c.name}</Text>
                  <View style={[styles.gridBadge, { backgroundColor: genre.color + "22" }]}>
                    <Feather name={genre.icon as any} size={9} color={genre.color} />
                    <Text style={[styles.gridBadgeText, { color: genre.color }]}>{genre.name}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {myCreations.length > 0 && (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Long press a track to delete it
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingBottom: 8,
  },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  profileSection: { alignItems: "center", paddingVertical: 24 },
  avatarLarge: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  avatarChar: { fontSize: 36, fontFamily: "Inter_700Bold" },
  username: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 4 },
  joinDate: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statsRow: {
    flexDirection: "row", marginHorizontal: 20, borderRadius: 18, borderWidth: 1,
    paddingVertical: 20, justifyContent: "space-around", marginBottom: 4,
  },
  statItem: { alignItems: "center", flex: 1 },
  statNum: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 2 },
  statLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  statDivider: { width: 1, opacity: 0.4 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, marginBottom: 12, gap: 8,
  },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  countPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  emptyCard: {
    marginHorizontal: 20, borderRadius: 18, borderWidth: 1,
    padding: 32, alignItems: "center", gap: 8,
  },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold", marginTop: 4 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20, gap: 12 },
  gridItem: { width: "47%", borderRadius: 16, borderWidth: 1.5, padding: 12, gap: 8 },
  gridTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  gridDot: { width: 8, height: 8, borderRadius: 4 },
  gridDur: { fontSize: 11, fontFamily: "Inter_500Medium", flex: 1 },
  gridName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  gridBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  gridBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  hint: {
    textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular",
    marginTop: 16, marginBottom: 4, opacity: 0.7,
  },
});
