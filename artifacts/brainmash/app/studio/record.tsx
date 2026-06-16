import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WaveformVisualizer } from "@/components/WaveformVisualizer";
import { useColors } from "@/hooks/useColors";
import { useStudio } from "@/context/StudioContext";

const IS_WEB = Platform.OS === "web";

export default function RecordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setAudioFile } = useStudio();

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  // Native (expo-av)
  const avRecordingRef = useRef<Audio.Recording | null>(null);
  // Web (MediaRecorder)
  const mediaRecorderRef = useRef<any>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<any>(null);
  const startTimeRef = useRef(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const topPad = IS_WEB ? 67 : insets.top;
  const bottomPad = IS_WEB ? 34 : insets.bottom;

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      avRecordingRef.current?.stopAndUnloadAsync().catch(() => {});
      if (mediaRecorderRef.current?.state !== "inactive") {
        try { mediaRecorderRef.current?.stop(); } catch {}
      }
      streamRef.current?.getTracks().forEach((t: any) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (recording) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s >= 60) { handleStop(); return s; }
          return s + 1;
        });
      }, 1000);
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [recording]);

  // ─── Web recording ────────────────────────────────────────────────────────
  const startRecordingWeb = async () => {
    try {
      setPermissionError(false);
      const nav = navigator as any;
      const stream = await nav.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new (window as any).MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e: any) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const dur = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioFile({ name: "My Recording", duration: dur, uri: url, source: "recorded" });
        setDone(true);
        streamRef.current?.getTracks().forEach((t: any) => t.stop());
        streamRef.current = null;
      };
      mr.start();
      mediaRecorderRef.current = mr;
      startTimeRef.current = Date.now();
      setRecording(true);
      setDone(false);
      setSeconds(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      setPermissionError(true);
    }
  };

  const stopRecordingWeb = () => {
    setRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ─── Native recording (expo-av) ───────────────────────────────────────────
  const startRecordingNative = async () => {
    try {
      setPermissionError(false);
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { setPermissionError(true); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      avRecordingRef.current = rec;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      startTimeRef.current = Date.now();
      setRecording(true);
      setDone(false);
      setSeconds(0);
    } catch {
      setPermissionError(true);
    }
  };

  const stopRecordingNative = async () => {
    if (!avRecordingRef.current) return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRecording(false);
      await avRecordingRef.current.stopAndUnloadAsync();
      const uri = avRecordingRef.current.getURI();
      avRecordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const dur = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
      setAudioFile({ name: "My Recording", duration: dur, uri: uri ?? "", source: "recorded" });
      setDone(true);
    } catch {
      setRecording(false);
      setDone(false);
    }
  };

  // ─── Unified handlers ─────────────────────────────────────────────────────
  const handleStart = () => IS_WEB ? startRecordingWeb() : startRecordingNative();
  const handleStop  = () => IS_WEB ? stopRecordingWeb()  : stopRecordingNative();
  const handleTap   = () => recording ? handleStop() : handleStart();

  const handleImport = async () => {
    if (IS_WEB) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*";
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setAudioFile({
          name: file.name.replace(/\.[^/.]+$/, ""),
          duration: 30,
          uri: url,
          source: "imported",
        });
        setDone(true);
      };
      input.click();
      return;
    }
    // Native — dynamic import to avoid web bundling issues
    try {
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/mpeg", "audio/wav", "audio/x-m4a", "audio/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setAudioFile({
        name: asset.name.replace(/\.[^/.]+$/, ""),
        duration: 30,
        uri: asset.uri,
        source: "imported",
      });
      setDone(true);
    } catch {}
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.nav, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="x" size={24} color={colors.textSecondary} />
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.text }]}>Record</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.statusRow}>
        {recording && (
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>RECORDING</Text>
          </View>
        )}
        {done && !recording && (
          <View style={[styles.badge, { backgroundColor: colors.success + "22", borderColor: colors.success + "55" }]}>
            <Feather name="check" size={12} color={colors.success} />
            <Text style={[styles.badgeText, { color: colors.success }]}>Ready</Text>
          </View>
        )}
        {permissionError && (
          <View style={[styles.badge, { backgroundColor: colors.hot + "22", borderColor: colors.hot + "55" }]}>
            <Feather name="alert-circle" size={12} color={colors.hot} />
            <Text style={[styles.badgeText, { color: colors.hot }]}>
              Mic access denied — import a file instead
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.timer, { color: recording ? colors.hot : colors.text }]}>
        {formatTime(seconds)}
      </Text>
      <Text style={[styles.maxLabel, { color: colors.mutedForeground }]}>Max 60s</Text>

      <View style={styles.waveformSection}>
        <WaveformVisualizer
          active={recording}
          color={recording ? colors.hot : done ? colors.success : colors.mutedForeground}
          barCount={50}
          height={100}
          seed={77}
        />
      </View>

      <View style={styles.buttonSection}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Pressable
            onPress={handleTap}
            style={[
              styles.recordBtn,
              {
                backgroundColor: recording ? colors.hot : done ? colors.success : colors.primary,
                shadowColor: recording ? colors.hot : done ? colors.success : colors.primary,
              },
            ]}
          >
            <Feather
              name={recording ? "square" : done ? "check" : "mic"}
              size={36}
              color="#fff"
            />
          </Pressable>
        </Animated.View>
        <Text style={[styles.recordHint, { color: colors.mutedForeground }]}>
          {recording ? "Tap to stop" : done ? "Tap to re-record" : "Tap to record"}
        </Text>
      </View>

      {!recording && (
        <Pressable
          onPress={handleImport}
          style={({ pressed }) => [styles.importBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="upload" size={16} color={colors.accent} />
          <Text style={[styles.importText, { color: colors.accent }]}>Import audio file</Text>
        </Pressable>
      )}

      {done && !recording && (
        <Pressable
          onPress={() => router.push("/studio/trim")}
          style={({ pressed }) => [
            styles.nextBtn,
            { backgroundColor: colors.primary, marginBottom: bottomPad + 24, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.nextText}>Trim Audio</Text>
          <Feather name="scissors" size={20} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center" },
  nav: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  navTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  statusRow: { minHeight: 32, justifyContent: "center", marginBottom: 4, paddingHorizontal: 20 },
  recordingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FF444422",
    borderColor: "#FF444455",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  recordingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#FF4444" },
  recordingText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#FF4444", letterSpacing: 1 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  timer: {
    fontSize: 64,
    fontFamily: "Inter_700Bold",
    letterSpacing: -2,
    marginBottom: 4,
  },
  maxLabel: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 32 },
  waveformSection: {
    width: "100%",
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  buttonSection: { alignItems: "center", marginBottom: 20 },
  recordBtn: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
    marginBottom: 12,
  },
  recordHint: { fontSize: 14, fontFamily: "Inter_500Medium" },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    marginBottom: 12,
  },
  importText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 28,
    paddingHorizontal: 32,
    paddingVertical: 18,
    marginTop: "auto",
    shadowColor: "#7B2FFF",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  nextText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
});
