import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CreationCard } from "@/components/CreationCard";
import { useColors } from "@/hooks/useColors";
import { GENRES, GenreId, useStudio } from "@/context/StudioContext";

const SORT_TABS = ["Trending", "Recent"] as const;
type SortTab = (typeof SORT_TABS)[number];

const ALL_FILTER = "all";

export default function SocialScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { feedCreations } = useStudio();

  const [sortTab, setSortTab] = useState<SortTab>("Trending");
  const [genreFilter, setGenreFilter] = useState<GenreId | "all">(ALL_FILTER);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const handleRefresh = () => {
    setRefreshing(true);
    setPlayingId(null);
    setTimeout(() => setRefreshing(false), 700);
  };

  const sorted = useMemo(() => {
    let list = genreFilter === ALL_FILTER
      ? [...feedCreations]
      : feedCreations.filter((c) => c.genre === genreFilter);
    return sortTab === "Trending"
      ? list.sort((a, b) => b.likes - a.likes)
      : list.sort((a, b) => b.createdAt - a.createdAt);
  }, [feedCreations, sortTab, genreFilter]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={[styles.title, { color: colors.text }]}>Social</Text>
        <Pressable style={[styles.searchBtn, { backgroundColor: colors.card }]}>
          <Feather name="search" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Genre filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <Pressable
          onPress={() => setGenreFilter(ALL_FILTER)}
          style={[
            styles.filterChip,
            genreFilter === ALL_FILTER
              ? { backgroundColor: colors.primary + "22", borderColor: colors.primary }
              : { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <Text style={[
            styles.filterChipText,
            { color: genreFilter === ALL_FILTER ? colors.primary : colors.mutedForeground },
          ]}>All</Text>
        </Pressable>
        {GENRES.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => setGenreFilter(genreFilter === g.id ? ALL_FILTER : g.id)}
            style={[
              styles.filterChip,
              genreFilter === g.id
                ? { backgroundColor: g.color + "22", borderColor: g.color }
                : { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <Feather name={g.icon as any} size={12} color={genreFilter === g.id ? g.color : colors.mutedForeground} />
            <Text style={[
              styles.filterChipText,
              { color: genreFilter === g.id ? g.color : colors.mutedForeground },
            ]}>{g.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Sort tabs */}
      <View style={[styles.sortBar, { borderBottomColor: colors.border }]}>
        {SORT_TABS.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => { setSortTab(tab); setPlayingId(null); }}
            style={styles.sortTab}
          >
            <Text style={[
              styles.sortTabText,
              sortTab === tab
                ? { color: colors.primary, fontFamily: "Inter_700Bold" }
                : { color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
            ]}>
              {tab}
            </Text>
            {sortTab === tab && (
              <View style={[styles.sortIndicator, { backgroundColor: colors.primary }]} />
            )}
          </Pressable>
        ))}
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CreationCard
            creation={item}
            playing={playingId === item.id}
            onPlay={() => setPlayingId((p) => (p === item.id ? null : item.id))}
          />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="users" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No tracks for this filter
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  searchBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sortBar: {
    flexDirection: "row",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  sortTab: {
    marginRight: 28,
    paddingBottom: 10,
    alignItems: "center",
    position: "relative",
  },
  sortTabText: { fontSize: 15 },
  sortIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },
  list: { paddingHorizontal: 20, paddingTop: 4 },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium" },
});
