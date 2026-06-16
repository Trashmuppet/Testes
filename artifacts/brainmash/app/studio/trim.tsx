import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useStudio } from "@/context/StudioContext";

const IS_WEB = Platform.OS === "web";
const WAVEFORM_HEIGHT = 100;
const BAR_COUNT = 60;
const HANDLE_HIT = 44;
const MIN_DURATION = 1; // seconds

// ─── Seeded waveform bars ─────────────────────────────────────────────────────
function seededBars(seed: number, count: number): number[] {
  let s = seed;
  const next = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  return Array.from({ length: count }, () => 0.2 + next() * 0.8);
}

// ─── Handle component ─────────────────────────────────────────────────────────
function Handle({ color }: { color: string }) {
  return (
    <View style={styles.handleOuter}>
      <View style={[styles.handleBar, { backgroundColor: color }]} />
      <View style={[styles.handleGrip, { backgroundColor: color }]}>
        <View style={[styles.handleDot, { backgroundColor: "#fff" }]} />
        <View style={[styles.handleDot, { backgroundColor: "#fff" }]} />
        <View style={[styles.handleDot, { backgroundColor: "#fff" }]} />
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function TrimScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { audioFile, setAudioFile } = useStudio();

  const topPad = IS_WEB ? 67 : insets.top;
  const bottomPad = IS_WEB ? 34 : insets.bottom;

  const duration = audioFile?.duration ?? 30;
  const minFrac = Math.min(MIN_DURATION / duration, 0.99);

  // ─── Trim state ─────────────────────────────────────────────────────────
  const [leftFrac, setLeftFrac] = useState(0);
  const [rightFrac, setRightFrac] = useState(1);
  const leftFracRef = useRef(0);
  const rightFracRef = useRef(1);
  const containerWidthRef = useRef(300);

  useEffect(() => { leftFracRef.current = leftFrac; }, [leftFrac]);
  useEffect(() => { rightFracRef.current = rightFrac; }, [rightFrac]);

  const trimmedSecs = Math.max(1, Math.round((rightFrac - leftFrac) * duration));

  // ─── Bars ────────────────────────────────────────────────────────────────
  const bars = seededBars(audioFile ? audioFile.uri.length * 7 + duration * 13 : 42, BAR_COUNT);

  // ─── Playback ────────────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<any>(null);

  useEffect(() => {
    if (!audioFile?.uri) return;
    if (IS_WEB) {
      const a = new (window as any).Audio(audioFile.uri);
      a.onended = () => setIsPlaying(false);
      webAudioRef.current = a;
      return () => { a.pause(); webAudioRef.current = null; };
    }
    let mounted = true;
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).then(() =>
      Audio.Sound.createAsync({ uri: audioFile.uri }, { shouldPlay: false }).then(({ sound }) => {
        if (mounted) soundRef.current = sound;
      }).catch(() => {})
    );
    return () => {
      mounted = false;
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [audioFile?.uri]);

  const handlePlayPause = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (IS_WEB) {
      const a = webAudioRef.current;
      if (!a) { setIsPlaying((p) => !p); return; }
      if (isPlaying) { a.pause(); a.currentTime = 0; setIsPlaying(false); }
      else { await a.play().catch(() => {}); setIsPlaying(true); }
      return;
    }
    if (!soundRef.current) { setIsPlaying((p) => !p); return; }
    const s = await soundRef.current.getStatusAsync();
    if (!s.isLoaded) return;
    if (s.isPlaying) { await soundRef.current.pauseAsync(); setIsPlaying(false); }
    else { await soundRef.current.setPositionAsync(Math.round(leftFrac * duration * 1000)); await soundRef.current.playAsync(); setIsPlaying(true); }
  };

  // ─── PanResponder: left handle ───────────────────────────────────────────
  const leftStartRef = useRef(0);
  const leftPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        leftStartRef.current = leftFracRef.current;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_, gs) => {
        const newFrac = Math.max(0, Math.min(
          leftStartRef.current + gs.dx / containerWidthRef.current,
          rightFracRef.current - minFrac
        ));
        leftFracRef.current = newFrac;
        setLeftFrac(newFrac);
      },
    })
  ).current;

  // ─── PanResponder: right handle ──────────────────────────────────────────
  const rightStartRef = useRef(1);
  const rightPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        rightStartRef.current = rightFracRef.current;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_, gs) => {
        const newFrac = Math.min(1, Math.max(
          rightStartRef.current + gs.dx / containerWidthRef.current,
          leftFracRef.current + minFrac
        ));
        rightFracRef.current = newFrac;
        setRightFrac(newFrac);
      },
    })
  ).current;

  // ─── Continue ────────────────────────────────────────────────────────────
  const handleContinue = () => {
    if (audioFile) {
      setAudioFile({ ...audioFile, duration: trimmedSecs });
    }
    if (IS_WEB) { webAudioRef.current?.pause(); }
    else { soundRef.current?.stopAsync().catch(() => {}); }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/studio/transform");
  };

  const handleSkip = () => {
    if (IS_WEB) { webAudioRef.current?.pause(); }
    else { soundRef.current?.stopAsync().catch(() => {}); }
    router.push("/studio/transform");
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Nav */}
      <View style={[styles.nav, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="arrow-left" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.text }]}>Trim</Text>
        <Pressable
          onPress={handleSkip}
          style={({ pressed }) => [styles.skipBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip</Text>
        </Pressable>
      </View>

      {/* File info */}
      <View style={[styles.fileRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Feather
          name={audioFile?.source === "recorded" ? "mic" : "file"}
          size={16}
          color={colors.accent}
        />
        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
          {audioFile?.name ?? "Recording"}
        </Text>
        <Text style={[styles.fileDur, { color: colors.mutedForeground }]}>
          {duration}s total
        </Text>
      </View>

      {/* Instructions */}
      <Text style={[styles.instructions, { color: colors.mutedForeground }]}>
        Drag the handles to select your best moment
      </Text>

      {/* Waveform + trim handles */}
      <View
        style={styles.waveformContainer}
        onLayout={(e) => { containerWidthRef.current = e.nativeEvent.layout.width; }}
      >
        {/* Bars */}
        <View style={styles.barsRow}>
          {bars.map((h, i) => {
            const frac = i / BAR_COUNT;
            const inSelection = frac >= leftFrac && frac <= rightFrac;
            return (
              <View
                key={i}
                style={[
                  styles.bar,
                  {
                    height: h * WAVEFORM_HEIGHT,
                    backgroundColor: inSelection ? colors.primary : colors.mutedForeground,
                    opacity: inSelection ? 0.9 : 0.2,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Selection border */}
        <View
          style={[
            styles.selectionBorder,
            {
              left: leftFrac * containerWidthRef.current,
              right: (1 - rightFrac) * containerWidthRef.current,
              borderColor: colors.primary,
            },
          ]}
          pointerEvents="none"
        />

        {/* Left handle */}
        <Animated.View
          {...leftPan.panHandlers}
          style={[
            styles.handleHitArea,
            { left: leftFrac * containerWidthRef.current - HANDLE_HIT / 2 },
          ]}
        >
          <Handle color={colors.primary} />
        </Animated.View>

        {/* Right handle */}
        <Animated.View
          {...rightPan.panHandlers}
          style={[
            styles.handleHitArea,
            { left: rightFrac * containerWidthRef.current - HANDLE_HIT / 2 },
          ]}
        >
          <Handle color={colors.primary} />
        </Animated.View>
      </View>

      {/* Time ruler */}
      <View style={styles.ruler}>
        <Text style={[styles.rulerLabel, { color: colors.mutedForeground }]}>0s</Text>
        <Text style={[styles.rulerLabel, { color: colors.mutedForeground }]}>{Math.round(duration / 2)}s</Text>
        <Text style={[styles.rulerLabel, { color: colors.mutedForeground }]}>{duration}s</Text>
      </View>

      {/* Selection info */}
      <View style={styles.selectionInfo}>
        <View style={[styles.selectionPill, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "55" }]}>
          <Feather name="scissors" size={14} color={colors.primary} />
          <Text style={[styles.selectionText, { color: colors.primary }]}>
            {trimmedSecs}s selected
          </Text>
        </View>
        <View style={[styles.selectionPill, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.selectionSub, { color: colors.mutedForeground }]}>
            {Math.round(leftFrac * duration)}s → {Math.round(rightFrac * duration)}s
          </Text>
        </View>
      </View>

      {/* Playback */}
      {audioFile?.uri && (
        <Pressable
          onPress={handlePlayPause}
          style={({ pressed }) => [
            styles.playBtn,
            { backgroundColor: colors.card, borderColor: colors.cardBorder, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name={isPlaying ? "pause" : "play"} size={18} color={colors.primary} />
          <Text style={[styles.playText, { color: colors.text }]}>
            {isPlaying ? "Stop preview" : "Preview selection"}
          </Text>
        </Pressable>
      )}

      {/* Limits */}
      <Text style={[styles.limitsText, { color: colors.mutedForeground }]}>
        Min 1s · BrainMash uses your selection as the creative seed
      </Text>

      {/* Continue */}
      <Pressable
        onPress={handleContinue}
        style={({ pressed }) => [
          styles.continueBtn,
          {
            backgroundColor: colors.primary,
            shadowColor: colors.primary,
            marginBottom: bottomPad + 24,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={styles.continueText}>Use This Clip</Text>
        <Feather name="arrow-right" size={20} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center" },
  nav: {
    width: "100%", flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16,
  },
  navBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  skipBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  skipText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  fileRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    width: "100%", marginHorizontal: 0, paddingHorizontal: 20,
    borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 12, marginBottom: 24,
  },
  fileName: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fileDur: { fontSize: 13, fontFamily: "Inter_400Regular" },
  instructions: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 20 },
  waveformContainer: {
    width: "100%",
    paddingHorizontal: 20,
    height: WAVEFORM_HEIGHT + 24,
    position: "relative",
    marginBottom: 8,
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: WAVEFORM_HEIGHT,
    gap: 2,
    overflow: "hidden",
  },
  bar: { flex: 1, borderRadius: 2 },
  selectionBorder: {
    position: "absolute",
    top: 0,
    height: WAVEFORM_HEIGHT,
    borderWidth: 2,
    borderRadius: 4,
    pointerEvents: "none",
  },
  handleHitArea: {
    position: "absolute",
    top: -8,
    height: WAVEFORM_HEIGHT + 16,
    width: HANDLE_HIT,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  handleOuter: { alignItems: "center", gap: 0 },
  handleBar: { width: 3, height: WAVEFORM_HEIGHT + 8, borderRadius: 2 },
  handleGrip: {
    position: "absolute",
    top: "50%",
    marginTop: -20,
    width: 22,
    height: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  handleDot: { width: 3, height: 3, borderRadius: 1.5 },
  ruler: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  rulerLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  selectionInfo: { flexDirection: "row", gap: 10, marginBottom: 20 },
  selectionPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  selectionText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  selectionSub: { fontSize: 13, fontFamily: "Inter_500Medium" },
  playBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 28, paddingHorizontal: 24, paddingVertical: 14, marginBottom: 16,
  },
  playText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  limitsText: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: "auto" as any, paddingHorizontal: 32 },
  continueBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 28, paddingHorizontal: 40, paddingVertical: 18, marginTop: 24,
    shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  continueText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
});
