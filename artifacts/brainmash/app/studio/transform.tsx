import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
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
import {
  CREATIVITY_OPTIONS,
  CreativityLevel,
  GENRES,
  GenreId,
  useStudio,
} from "@/context/StudioContext";

// ─── 3-Engine Generation Overlay ─────────────────────────────────────────────

const ENGINES = [
  {
    key: "dna",
    name: "Sound DNA Engine",
    steps: ["Slicing audio", "Extracting pitch & harmonics", "Building texture profile"],
    icon: "activity",
  },
  {
    key: "composition",
    name: "Composition Engine",
    steps: ["Setting tempo & groove", "Sequencing drums & bass", "Arranging song structure"],
    icon: "music",
  },
  {
    key: "synth",
    name: "Synth Engine",
    steps: ["Bass synthesis", "Generating pad layers", "Crafting lead synth"],
    icon: "cpu",
  },
];

const STEP_MS = 1500;

function GeneratingOverlay({ genre }: { genre: typeof GENRES[0] }) {
  const colors = useColors();
  const [engineIndex, setEngineIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: ENGINES.length * STEP_MS - 200,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    let ei = 0;
    let si = 0;
    const stepInterval = setInterval(() => {
      si++;
      if (si >= ENGINES[ei].steps.length) {
        si = 0;
        ei = Math.min(ei + 1, ENGINES.length - 1);
        setEngineIndex(ei);
      }
      setStepIndex(si);
    }, STEP_MS / ENGINES[0].steps.length);

    const engineInterval = setInterval(() => {
      setEngineIndex((prev) => Math.min(prev + 1, ENGINES.length - 1));
    }, STEP_MS);

    return () => { clearInterval(stepInterval); clearInterval(engineInterval); };
  }, []);

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <Animated.View style={[styles.overlay, { backgroundColor: colors.background, opacity: fadeAnim }]}>
      <View style={styles.overlayInner}>
        <View style={[styles.genreBadge, { backgroundColor: genre.color + "22", borderColor: genre.color + "55" }]}>
          <Feather name={genre.icon as any} size={14} color={genre.color} />
          <Text style={[styles.genreBadgeText, { color: genre.color }]}>{genre.name}</Text>
          <Text style={[styles.genreBpm, { color: genre.color + "99" }]}>{genre.bpm}</Text>
        </View>

        <Animated.View style={[styles.waveformWrap, { transform: [{ scale: pulseAnim }] }]}>
          <WaveformVisualizer active color={genre.color} barCount={48} height={80} seed={42} />
        </Animated.View>

        <Text style={[styles.overlayTitle, { color: colors.text }]}>Generating your track</Text>

        <View style={[styles.enginesCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {ENGINES.map((engine, i) => {
            const isActive = i === engineIndex;
            const isDone = i < engineIndex;
            return (
              <View key={engine.key} style={[styles.engineRow, i < ENGINES.length - 1 && { marginBottom: 18 }]}>
                <View style={[
                  styles.engineIcon,
                  {
                    backgroundColor: isDone ? colors.success + "22" : isActive ? genre.color + "22" : colors.muted,
                    borderColor: isDone ? colors.success + "55" : isActive ? genre.color + "55" : "transparent",
                    borderWidth: 1,
                  },
                ]}>
                  <Feather
                    name={isDone ? "check" : (engine.icon as any)}
                    size={16}
                    color={isDone ? colors.success : isActive ? genre.color : colors.mutedForeground}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.engineName, {
                    color: isDone ? colors.success : isActive ? colors.text : colors.mutedForeground,
                  }]}>
                    {engine.name}
                  </Text>
                  {isActive && (
                    <Text style={[styles.engineStep, { color: genre.color }]} numberOfLines={1}>
                      {engine.steps[Math.min(stepIndex, engine.steps.length - 1)]}
                    </Text>
                  )}
                  {isDone && (
                    <Text style={[styles.engineStep, { color: colors.success }]}>Complete</Text>
                  )}
                </View>
                {isActive && <View style={[styles.activeDot, { backgroundColor: genre.color }]} />}
              </View>
            );
          })}
        </View>

        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <Animated.View style={[styles.progressFill, { width: progressWidth as any, backgroundColor: genre.color }]} />
        </View>
        <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
          Sound DNA · Composition · Synth Engines
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Genre Card ───────────────────────────────────────────────────────────────

function GenreCard({ genre, selected, onSelect }: {
  genre: typeof GENRES[0];
  selected: boolean;
  onSelect: (id: GenreId) => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(genre.id); }}
      style={({ pressed }) => [
        styles.genreCard,
        {
          backgroundColor: selected ? genre.color + "22" : colors.card,
          borderColor: selected ? genre.color : colors.cardBorder,
          borderWidth: selected ? 2 : 1,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.genreIconWrap, { backgroundColor: genre.color + "22" }]}>
        <Feather name={genre.icon as any} size={22} color={genre.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.genreName, { color: selected ? genre.color : colors.text }]}>{genre.name}</Text>
        <Text style={[styles.genreBpmSmall, { color: colors.mutedForeground }]}>{genre.bpm}</Text>
        <Text style={[styles.genreTagline, { color: colors.mutedForeground }]} numberOfLines={1}>{genre.tagline}</Text>
      </View>
      {selected && <Feather name="check-circle" size={18} color={genre.color} />}
    </Pressable>
  );
}

// ─── Creativity Card ──────────────────────────────────────────────────────────

function CreativityCard({ option, selected, onSelect, accentColor }: {
  option: typeof CREATIVITY_OPTIONS[0];
  selected: boolean;
  onSelect: (id: CreativityLevel) => void;
  accentColor: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(option.id); }}
      style={({ pressed }) => [
        styles.creativityCard,
        {
          backgroundColor: selected ? accentColor + "22" : colors.card,
          borderColor: selected ? accentColor : colors.cardBorder,
          borderWidth: selected ? 2 : 1,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Feather name={option.icon as any} size={18} color={selected ? accentColor : colors.mutedForeground} />
      <Text style={[styles.creativityLabel, { color: selected ? accentColor : colors.text }]}>{option.label}</Text>
      <Text style={[styles.creativityDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
        {option.description}
      </Text>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TransformScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { audioFile, selectedGenre, selectGenre, creativity, setCreativity, generating, generate } = useStudio();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const genre = GENRES.find((g) => g.id === selectedGenre)!;

  const handleGenerate = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await generate();
    router.push("/studio/result");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.nav, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="arrow-left" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.text }]}>Create</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad + 120 }}>
        {audioFile && (
          <View style={[styles.fileStrip, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Feather name={audioFile.source === "recorded" ? "mic" : "file"} size={15} color={colors.accent} />
            <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{audioFile.name}</Text>
            <Text style={[styles.fileDur, { color: colors.mutedForeground }]}>{audioFile.duration}s</Text>
            <WaveformVisualizer active={false} color={colors.accent} barCount={20} height={24} seed={55} />
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Choose Genre</Text>
          <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
            What kind of music do you want to make?
          </Text>
        </View>

        {GENRES.map((g) => (
          <GenreCard key={g.id} genre={g} selected={selectedGenre === g.id} onSelect={selectGenre} />
        ))}

        <View style={[styles.sectionHeader, { marginTop: 28 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Creativity Level</Text>
          <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
            How adventurous should BrainMash be?
          </Text>
        </View>

        <View style={styles.creativityRow}>
          {CREATIVITY_OPTIONS.map((opt) => (
            <CreativityCard
              key={opt.id}
              option={opt}
              selected={creativity === opt.id}
              onSelect={setCreativity}
              accentColor={genre.color}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, paddingBottom: bottomPad + 16 }]}>
        <Pressable
          onPress={handleGenerate}
          disabled={generating || !audioFile}
          style={({ pressed }) => [
            styles.generateBtn,
            {
              backgroundColor: genre.color,
              shadowColor: genre.color,
              opacity: pressed ? 0.85 : !audioFile ? 0.5 : 1,
            },
          ]}
        >
          <Feather name="cpu" size={22} color="#fff" />
          <Text style={styles.generateBtnText}>Generate</Text>
        </Pressable>
      </View>

      {generating && <GeneratingOverlay genre={genre} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  nav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 8,
  },
  navBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  fileStrip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 20, marginBottom: 20,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10,
  },
  fileName: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fileDur: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sectionHeader: { paddingHorizontal: 20, marginBottom: 14 },
  sectionTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  sectionSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  genreCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginHorizontal: 20, marginBottom: 10, borderRadius: 16, padding: 14,
  },
  genreIconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  genreName: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 2 },
  genreBpmSmall: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 2 },
  genreTagline: { fontSize: 12, fontFamily: "Inter_400Regular" },
  creativityRow: { flexDirection: "row", paddingHorizontal: 20, gap: 10, marginBottom: 20 },
  creativityCard: { flex: 1, borderRadius: 16, padding: 14, alignItems: "center", gap: 6 },
  creativityLabel: { fontSize: 14, fontFamily: "Inter_700Bold" },
  creativityDesc: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 12,
  },
  generateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    borderRadius: 28, paddingVertical: 18,
    shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 12,
  },
  generateBtnText: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#fff" },
  // Overlay
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  overlayInner: { width: "100%", alignItems: "center", paddingHorizontal: 24 },
  genreBadge: {
    flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 32,
  },
  genreBadgeText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  genreBpm: { fontSize: 12, fontFamily: "Inter_400Regular" },
  waveformWrap: { width: "100%", marginBottom: 28 },
  overlayTitle: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 28, letterSpacing: -0.5 },
  enginesCard: { width: "100%", borderRadius: 20, borderWidth: 1, padding: 20, marginBottom: 24 },
  engineRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  engineIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  engineName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  engineStep: { fontSize: 12, fontFamily: "Inter_400Regular" },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  progressTrack: { width: "100%", height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 10 },
  progressFill: { height: 4, borderRadius: 2 },
  progressLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
});
