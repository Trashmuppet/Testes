import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { Creation, GENRES } from "@/context/StudioContext";
import { WaveformVisualizer } from "./WaveformVisualizer";

const IS_WEB = Platform.OS === "web";

function hasPlayableUri(uri: string | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith("file") || uri.startsWith("blob:") || uri.startsWith("http");
}

interface CreationCardProps {
  creation: Creation;
  onLike?: () => void;
  playing?: boolean;
  onPlay?: () => void;
  onDelete?: () => void;
}

export function CreationCard({ creation, onLike, playing = false, onPlay, onDelete }: CreationCardProps) {
  const colors = useColors();
  const genre = GENRES.find((g) => g.id === creation.genre)!;
  const [localLiked, setLocalLiked] = useState(creation.isLiked);
  const [likeCount, setLikeCount] = useState(creation.likes);

  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasAudio = hasPlayableUri(creation.audioUri);

  useEffect(() => {
    if (!hasAudio) return;
    let mounted = true;

    if (IS_WEB) {
      const audio = new (window as any).Audio(creation.audioUri) as any;
      audio.playbackRate = genre.rate;
      audio.onended = () => { audio.currentTime = 0; };
      webAudioRef.current = audio;
      return () => {
        mounted = false;
        audio.pause();
        webAudioRef.current = null;
      };
    }

    const load = async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: creation.audioUri },
          { shouldPlay: false },
          (status) => { if (status.isLoaded && status.didJustFinish) sound.setPositionAsync(0); }
        );
        if (mounted) soundRef.current = sound;
      } catch {}
    };
    load();

    return () => {
      mounted = false;
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [creation.audioUri, hasAudio]);

  useEffect(() => {
    if (!hasAudio) return;

    if (IS_WEB) {
      const audio = webAudioRef.current as any;
      if (!audio) return;
      if (playing) {
        audio.playbackRate = genre.rate;
        audio.play().catch(() => {});
      } else {
        audio.pause();
        audio.currentTime = 0;
      }
      return;
    }

    if (!soundRef.current) return;
    if (playing) {
      soundRef.current.setRateAsync(genre.rate, genre.pitchCorrection).catch(() => {});
      soundRef.current.playAsync().catch(() => {});
    } else {
      soundRef.current.pauseAsync().catch(() => {});
      soundRef.current.setPositionAsync(0).catch(() => {});
    }
  }, [playing, genre.rate, genre.pitchCorrection, hasAudio]);

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalLiked((prev) => {
      const next = !prev;
      setLikeCount((c) => (next ? c + 1 : c - 1));
      return next;
    });
    onLike?.();
  };

  const timeAgo = () => {
    const diff = Date.now() - creation.createdAt;
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: playing ? genre.color : colors.cardBorder }]}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: genre.color + "33" }]}>
          <Text style={[styles.avatarText, { color: genre.color }]}>
            {creation.username[0].toUpperCase()}
          </Text>
        </View>
        <View style={styles.meta}>
          <Text style={[styles.username, { color: colors.text }]}>{creation.username}</Text>
          <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeAgo()}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: genre.color + "22", borderColor: genre.color + "55" }]}>
          <Feather name={genre.icon as any} size={10} color={genre.color} />
          <Text style={[styles.badgeText, { color: genre.color }]}>{genre.name}</Text>
        </View>
      </View>

      <Text style={[styles.creationName, { color: colors.text }]} numberOfLines={1}>
        {creation.name}
      </Text>

      <View style={styles.waveformRow}>
        <WaveformVisualizer
          active={playing}
          color={genre.color}
          barCount={36}
          height={44}
          seed={creation.waveformSeed}
        />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.duration, { color: colors.textSecondary }]}>{creation.duration}s</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPlay?.(); }}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Feather name={playing ? "pause" : "play"} size={18} color={playing ? genre.color : colors.accent} />
          </Pressable>
          <Pressable
            onPress={handleLike}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Feather name="heart" size={16} color={localLiked ? colors.hot : colors.mutedForeground} />
            <Text style={[styles.likeCount, { color: localLiked ? colors.hot : colors.mutedForeground }]}>
              {likeCount}
            </Text>
          </Pressable>
          {onDelete ? (
            <Pressable
              onPress={onDelete}
              style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Feather name="trash-2" size={15} color={colors.mutedForeground} />
            </Pressable>
          ) : (
            <Pressable style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <Feather name="share-2" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 10 },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  meta: { flex: 1 },
  username: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  creationName: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 12 },
  waveformRow: { marginBottom: 12 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  duration: { fontSize: 13, fontFamily: "Inter_500Medium" },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 6 },
  likeCount: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
