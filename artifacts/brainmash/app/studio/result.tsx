import { Feather } from "@expo/vector-icons";
import { Audio, AVPlaybackStatus } from "expo-av";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PlaybackWaveformVisualizer } from "@/components/PlaybackWaveformVisualizer";
import { ShareCardModal } from "@/components/ShareCardModal";
import { useColors } from "@/hooks/useColors";
import { GENRES, useStudio } from "@/context/StudioContext";

const IS_WEB = Platform.OS === "web";

function hasPlayableUri(uri: string | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith("file") || uri.startsWith("blob:") || uri.startsWith("http");
}

function getActiveUri(creation: { audioUri: string; originalAudioUri: string }, comparing: boolean): string {
  return comparing ? (creation.originalAudioUri || creation.audioUri) : creation.audioUri;
}

const AUDIO_FORMATS = [
  { id: "wav", label: "WAV", icon: "file", desc: "Lossless" },
  { id: "mp3", label: "MP3", icon: "music", desc: "Compressed" },
] as const;

const VIDEO_FORMATS = [
  { id: "square",    label: "Square",    desc: "1080×1080 · Instagram" },
  { id: "portrait",  label: "Portrait",  desc: "1080×1920 · TikTok/Reels" },
  { id: "landscape", label: "Landscape", desc: "1920×1080 · YouTube" },
] as const;

export default function ResultScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentCreation, saveCreation, reset, generate } = useStudio();

  const [isPlaying, setIsPlaying] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [creationName, setCreationName] = useState(currentCreation?.name ?? "My Track");
  const [exported, setExported] = useState<string | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  // State mirror of webAudioRef so PlaybackWaveformVisualizer re-renders on swap
  const [webAudioElement, setWebAudioElement] = useState<HTMLAudioElement | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const topPad = IS_WEB ? 67 : insets.top;
  const bottomPad = IS_WEB ? 34 : insets.bottom;

  const genre = currentCreation ? GENRES.find((g) => g.id === currentCreation.genre)! : GENRES[0];
  const activeUri = currentCreation ? getActiveUri(currentCreation, comparing) : "";
  const hasRealAudio = hasPlayableUri(activeUri);

  // ─── Web audio ────────────────────────────────────────────────────────────
  const loadWebAudio = useCallback((uri: string, playbackRate: number) => {
    if (!uri || !hasPlayableUri(uri)) return;
    webAudioRef.current?.pause();
    const audio = new (window as any).Audio(uri) as any;
    audio.playbackRate = playbackRate;
    audio.onloadedmetadata = () => setDurationMs(Math.round(audio.duration * 1000));
    audio.onended = () => { setIsPlaying(false); audio.currentTime = 0; setPositionMs(0); };
    webAudioRef.current = audio;
    setWebAudioElement(audio as HTMLAudioElement);
    setPositionMs(0);
    setDurationMs(0);
  }, []);

  // ─── Native audio ─────────────────────────────────────────────────────────
  const loadNativeAudio = useCallback(async (uri: string, rate: number, pitchCorrection: boolean) => {
    if (!uri || !hasPlayableUri(uri)) return;
    try {
      await soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false, rate, shouldCorrectPitch: pitchCorrection },
        (status: AVPlaybackStatus) => {
          if (status.isLoaded) {
            setPositionMs(status.positionMillis);
            setDurationMs(status.durationMillis ?? 0);
            if (status.didJustFinish) { setIsPlaying(false); sound.setPositionAsync(0); }
          }
        }
      );
      soundRef.current = sound;
      setPositionMs(0);
      setDurationMs(0);
    } catch {}
  }, []);

  // Reload audio whenever the active URI (or compare mode) changes
  useEffect(() => {
    if (!currentCreation) return;
    const uri = getActiveUri(currentCreation, comparing);
    // In compare mode: play original at 1× speed, no pitch processing
    // In generated mode: play processed audio at 1× (already time-stretched) — rate label is informational
    const rate = 1.0;
    const pitchCorrection = false;

    if (IS_WEB) {
      loadWebAudio(uri, rate);
      return () => {
        webAudioRef.current?.pause();
        webAudioRef.current = null;
        if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      };
    }
    void loadNativeAudio(uri, rate, pitchCorrection);
    return () => { soundRef.current?.unloadAsync().catch(() => {}); soundRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparing, currentCreation?.audioUri, currentCreation?.originalAudioUri]);

  const startProgressTimer = () => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      const a = webAudioRef.current as any;
      if (a) setPositionMs(Math.round(a.currentTime * 1000));
    }, 200);
  };
  const stopProgressTimer = () => {
    if (progressTimerRef.current) { clearInterval(progressTimerRef.current); progressTimerRef.current = null; }
  };

  const stopPlayback = useCallback(() => {
    if (IS_WEB) { webAudioRef.current?.pause(); stopProgressTimer(); }
    else { soundRef.current?.pauseAsync().catch(() => {}); }
    setIsPlaying(false);
  }, []);

  const handleCompareToggle = (val: boolean) => {
    stopPlayback();
    setPositionMs(0);
    setComparing(val);
  };

  const handlePlayPause = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (IS_WEB) {
      const audio = webAudioRef.current as any;
      if (!audio) { setIsPlaying((p) => !p); return; }
      if (isPlaying) { audio.pause(); stopProgressTimer(); setIsPlaying(false); }
      else { await audio.play().catch(() => {}); startProgressTimer(); setIsPlaying(true); }
      return;
    }
    if (!soundRef.current) { setIsPlaying((p) => !p); return; }
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) { await soundRef.current.pauseAsync(); setIsPlaying(false); }
    else { await soundRef.current.playAsync(); setIsPlaying(true); }
  };

  const handleRestart = async () => {
    if (IS_WEB) {
      const audio = webAudioRef.current as any;
      if (!audio) return;
      audio.currentTime = 0;
      await audio.play().catch(() => {});
      startProgressTimer();
      setIsPlaying(true);
      setPositionMs(0);
      return;
    }
    if (!soundRef.current) return;
    await soundRef.current.setPositionAsync(0);
    await soundRef.current.playAsync();
    setIsPlaying(true);
  };

  const handleRegenerate = async () => {
    stopPlayback();
    setPositionMs(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.back(); // go back to genre/creativity screen to regenerate
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    saveCreation(creationName);
    setSaved(true);
  };

  const handleExport = (format: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (IS_WEB && hasPlayableUri(currentCreation?.audioUri)) {
      const a = document.createElement("a");
      a.href = currentCreation!.audioUri;
      a.download = `${creationName}.${format === "wav" ? "wav" : "webm"}`;
      a.click();
    }
    setExported(format);
    setTimeout(() => setExported(null), 2000);
  };

  const handleDone = () => {
    stopPlayback();
    if (!saved) handleSave();
    reset();
    router.replace("/");
  };

  const formatMs = (ms: number) => {
    const t = Math.floor(ms / 1000);
    return `${Math.floor(t / 60).toString().padStart(2, "0")}:${(t % 60).toString().padStart(2, "0")}`;
  };

  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  if (!currentCreation) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>No track found</Text>
        <Pressable onPress={() => router.replace("/")}>
          <Text style={[{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 15, marginTop: 8 }]}>Go home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.nav, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="arrow-left" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.text }]}>Your Track</Text>
        <Pressable
          onPress={handleRegenerate}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="refresh-cw" size={20} color={colors.accent} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad + 24 }}>
        {/* Genre + creativity */}
        <View style={styles.metaRow}>
          <View style={[styles.genreBadge, { backgroundColor: genre.color + "22", borderColor: genre.color + "55" }]}>
            <Feather name={genre.icon as any} size={12} color={genre.color} />
            <Text style={[styles.genreBadgeText, { color: genre.color }]}>{genre.name}</Text>
          </View>
          <View style={[styles.creativityBadge, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.creativityBadgeText, { color: colors.mutedForeground }]}>
              {currentCreation.creativity}
            </Text>
          </View>
          <Text style={[styles.durationText, { color: colors.mutedForeground }]}>{currentCreation.duration}s</Text>
        </View>

        <TextInput
          value={creationName}
          onChangeText={setCreationName}
          style={[styles.nameInput, { color: colors.text }]}
          placeholderTextColor={colors.mutedForeground}
          placeholder="Name your track..."
          editable={!saved}
        />

        {/* Player */}
        <View style={[styles.playerCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {/* Compare toggle */}
          <View style={[styles.compareRow, { backgroundColor: colors.muted }]}>
            <Pressable
              onPress={() => handleCompareToggle(false)}
              style={[styles.compareBtn, !comparing && { backgroundColor: colors.card }]}
            >
              <Feather name="cpu" size={12} color={comparing ? colors.mutedForeground : genre.color} />
              <Text style={[styles.compareLabel, { color: comparing ? colors.mutedForeground : genre.color }]}>Generated</Text>
            </Pressable>
            <Pressable
              onPress={() => handleCompareToggle(true)}
              style={[styles.compareBtn, comparing && { backgroundColor: colors.card }]}
            >
              <Feather name="mic" size={12} color={comparing ? colors.accent : colors.mutedForeground} />
              <Text style={[styles.compareLabel, { color: comparing ? colors.accent : colors.mutedForeground }]}>Original</Text>
            </Pressable>
          </View>

          <View style={{ marginBottom: 12 }}>
            <PlaybackWaveformVisualizer
              isPlaying={isPlaying}
              color={comparing ? colors.accent : genre.color}
              barCount={44}
              height={80}
              seed={comparing ? 22 : currentCreation.waveformSeed}
              audioElement={IS_WEB ? webAudioElement : undefined}
            />
          </View>

          {hasRealAudio && durationMs > 0 && (
            <View style={styles.progressRow}>
              <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>{formatMs(positionMs)}</Text>
              <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                <View style={[styles.progressFill, {
                  width: `${progress * 100}%` as any,
                  backgroundColor: comparing ? colors.accent : genre.color,
                }]} />
              </View>
              <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>{formatMs(durationMs)}</Text>
            </View>
          )}

          <View style={styles.playbackRow}>
            <Pressable
              onPress={handleRestart}
              style={({ pressed }) => [styles.controlBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Feather name="skip-back" size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={handlePlayPause} style={[styles.playBtn, { backgroundColor: genre.color }]}>
              <Feather name={isPlaying ? "pause" : "play"} size={22} color="#fff" />
            </Pressable>
            <Pressable
              onPress={handleRegenerate}
              style={({ pressed }) => [styles.controlBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Feather name="refresh-cw" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {hasRealAudio && (
            <Text style={[styles.effectLabel, { color: colors.mutedForeground }]}>
              {comparing
                ? "Original recording · unprocessed"
                : `${genre.name} · DSP processed · ${genre.bpm}`}
            </Text>
          )}
        </View>

        {/* Export Audio */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Export Audio</Text>
        <View style={styles.exportRow}>
          {AUDIO_FORMATS.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => handleExport(f.id)}
              style={({ pressed }) => [
                styles.exportBtn,
                {
                  backgroundColor: exported === f.id ? colors.success + "22" : colors.card,
                  borderColor: exported === f.id ? colors.success : colors.cardBorder,
                  opacity: pressed ? 0.8 : 1,
                  flex: 1,
                },
              ]}
            >
              <Feather name={exported === f.id ? "check" : (f.icon as any)} size={18}
                color={exported === f.id ? colors.success : colors.text} />
              <Text style={[styles.exportLabel, { color: exported === f.id ? colors.success : colors.text }]}>{f.label}</Text>
              <Text style={[styles.exportDesc, { color: colors.mutedForeground }]}>{f.desc}</Text>
            </Pressable>
          ))}
        </View>

        {/* Share Card */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Share</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowShareCard(true);
          }}
          style={({ pressed }) => [
            styles.shareCardBtn,
            {
              backgroundColor: genre.color + "18",
              borderColor: genre.color + "66",
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={[styles.shareCardIcon, { backgroundColor: genre.color + "33" }]}>
            <Feather name="image" size={22} color={genre.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.shareCardLabel, { color: colors.text }]}>Create Share Card</Text>
            <Text style={[styles.shareCardDesc, { color: colors.mutedForeground }]}>
              Branded image for Instagram, TikTok, YouTube
            </Text>
          </View>
          <Feather name="arrow-right" size={18} color={genre.color} />
        </Pressable>

        {/* Export Video */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Export Video</Text>
        <View style={styles.videoList}>
          {VIDEO_FORMATS.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => handleExport(f.id)}
              style={({ pressed }) => [
                styles.videoBtn,
                {
                  backgroundColor: exported === f.id ? genre.color + "22" : colors.card,
                  borderColor: exported === f.id ? genre.color : colors.cardBorder,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Feather name={exported === f.id ? "check" : "film"} size={16}
                color={exported === f.id ? genre.color : colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.videoLabel, { color: colors.text }]}>{f.label}</Text>
                <Text style={[styles.videoDesc, { color: colors.mutedForeground }]}>{f.desc}</Text>
              </View>
              <Feather name="download" size={16} color={exported === f.id ? genre.color : colors.mutedForeground} />
            </Pressable>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={handleSave}
            disabled={saved}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: saved ? colors.success + "22" : colors.card,
                borderColor: saved ? colors.success : colors.cardBorder,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Feather name={saved ? "check" : "bookmark"} size={18} color={saved ? colors.success : colors.textSecondary} />
            <Text style={[styles.saveBtnText, { color: saved ? colors.success : colors.text }]}>
              {saved ? "Saved" : "Save"}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleDone}
            style={({ pressed }) => [
              styles.doneBtn,
              { backgroundColor: genre.color, opacity: pressed ? 0.85 : 1, shadowColor: genre.color },
            ]}
          >
            <Text style={styles.doneBtnText}>Done</Text>
            <Feather name="check" size={18} color="#fff" />
          </Pressable>
        </View>
      </ScrollView>

      <ShareCardModal
        creation={{ ...currentCreation, name: creationName }}
        visible={showShareCard}
        onClose={() => setShowShareCard(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  errorText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  nav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 8,
  },
  navBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  metaRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, marginBottom: 10,
  },
  genreBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },
  genreBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  creativityBadge: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },
  creativityBadgeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  durationText: { fontSize: 13, fontFamily: "Inter_500Medium", marginLeft: "auto" as any },
  nameInput: {
    fontSize: 24, fontFamily: "Inter_700Bold",
    paddingHorizontal: 20, marginBottom: 16, letterSpacing: -0.5,
  },
  playerCard: {
    marginHorizontal: 20, borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 24,
  },
  compareRow: {
    flexDirection: "row", borderRadius: 12, padding: 4, marginBottom: 16, gap: 4,
  },
  compareBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 9, paddingVertical: 8,
  },
  compareLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  timeLabel: { fontSize: 11, fontFamily: "Inter_400Regular", width: 36 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 3, borderRadius: 2 },
  playbackRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 8,
  },
  controlBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  playBtn: {
    width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center",
    shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  effectLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 },
  sectionTitle: { fontSize: 17, fontFamily: "Inter_700Bold", paddingHorizontal: 20, marginBottom: 12 },
  exportRow: { flexDirection: "row", gap: 12, paddingHorizontal: 20, marginBottom: 24 },
  exportBtn: { borderRadius: 16, borderWidth: 1, padding: 16, alignItems: "center", gap: 6 },
  exportLabel: { fontSize: 15, fontFamily: "Inter_700Bold" },
  exportDesc: { fontSize: 11, fontFamily: "Inter_400Regular" },
  videoList: { paddingHorizontal: 20, gap: 8, marginBottom: 24 },
  videoBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  videoLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
  videoDesc: { fontSize: 12, fontFamily: "Inter_400Regular" },
  shareCardBtn: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginHorizontal: 20, marginBottom: 24, borderRadius: 16, borderWidth: 1, padding: 16,
  },
  shareCardIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  shareCardLabel: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 2 },
  shareCardDesc: { fontSize: 12, fontFamily: "Inter_400Regular" },
  actionRow: { flexDirection: "row", paddingHorizontal: 20, gap: 12 },
  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 24, paddingVertical: 16,
  },
  saveBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  doneBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    borderRadius: 20, paddingVertical: 16,
    shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  doneBtnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
});
