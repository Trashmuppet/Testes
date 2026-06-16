/**
 * LiveWaveformVisualizer
 *
 * Real-time microphone amplitude visualizer.
 *
 * Web:    AnalyserNode → requestAnimationFrame → <canvas> bars
 * Native: expo-av metering (averagePowerDecibels) → Animated bar heights
 *
 * Props:
 *   stream    — MediaStream from getUserMedia (web)
 *   recording — Audio.Recording instance (native)
 *   active    — whether mic is live
 *   color     — bar fill color
 *   barCount  — number of frequency bars (default 50)
 *   height    — component height in px (default 100)
 */

import { Audio } from "expo-av";
import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";

const IS_WEB = Platform.OS === "web";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map a dBFS value (−160..0) to a 0–1 amplitude */
function dbToAmplitude(db: number): number {
  if (db <= -80) return 0;
  return Math.max(0, Math.min(1, (db + 80) / 80));
}

/** Simple seeded random (for idle idle shimmer pattern) */
function seededRand(i: number): number {
  const x = Math.sin(i * 9301 + 49297) * 439.5;
  return x - Math.floor(x);
}

// ─── Web canvas visualizer ────────────────────────────────────────────────────

interface WebVisualizerProps {
  stream: MediaStream | null;
  active: boolean;
  color: string;
  barCount: number;
  height: number;
}

function WebVisualizer({ stream, active, color, barCount, height }: WebVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Build/tear down analyser when stream changes
  useEffect(() => {
    if (!active || !stream) {
      analyserRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;
    return () => {
      source.disconnect();
      ctx.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    };
  }, [stream, active]);

  // rAF draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const dataArray = new Uint8Array(analyserRef.current?.frequencyBinCount ?? 128);
    let idlePhase = 0;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      const analyser = analyserRef.current;
      if (analyser && active) {
        analyser.getByteFrequencyData(dataArray);
        // We sample evenly across the lower 2/3 of the spectrum (most musical content)
        const usableBins = Math.floor(dataArray.length * 0.66);
        const step = usableBins / barCount;
        const barW = Math.max(1, (w - (barCount - 1) * 2) / barCount);

        ctx2d.fillStyle = color;
        for (let i = 0; i < barCount; i++) {
          const binIndex = Math.floor(i * step);
          const raw = dataArray[binIndex] / 255;
          // Apply a gentle curve so quiet sounds still show something
          const amplitude = Math.pow(raw, 0.7);
          const barH = Math.max(2, amplitude * h);
          const x = i * (barW + 2);
          const y = (h - barH) / 2;
          const radius = Math.min(barW / 2, 3);
          ctx2d.beginPath();
          ctx2d.roundRect(x, y, barW, barH, radius);
          ctx2d.fill();
        }
      } else {
        // Idle shimmer: gentle sine-modulated static bars
        idlePhase += 0.025;
        const barW = Math.max(1, (w - (barCount - 1) * 2) / barCount);
        ctx2d.fillStyle = color;
        ctx2d.globalAlpha = 0.35;
        for (let i = 0; i < barCount; i++) {
          const base = 0.08 + seededRand(i) * 0.22;
          const mod = Math.sin(idlePhase + i * 0.4) * 0.05;
          const amplitude = Math.max(0.04, base + mod);
          const barH = Math.max(2, amplitude * h);
          const x = i * (barW + 2);
          const y = (h - barH) / 2;
          const radius = Math.min(barW / 2, 3);
          ctx2d.beginPath();
          ctx2d.roundRect(x, y, barW, barH, radius);
          ctx2d.fill();
        }
        ctx2d.globalAlpha = 1;
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, color, barCount]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={height * 2}
      style={{ width: "100%", height, display: "block" }}
    />
  );
}

// ─── Native Animated visualizer ───────────────────────────────────────────────

interface NativeVisualizerProps {
  recording: Audio.Recording | null;
  active: boolean;
  color: string;
  barCount: number;
  height: number;
}

function NativeVisualizer({ recording, active, color, barCount, height }: NativeVisualizerProps) {
  const animations = useRef<Animated.Value[]>(
    Array.from({ length: barCount }, () => new Animated.Value(0.08))
  ).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll metering data from expo-av while recording
  useEffect(() => {
    if (!active || !recording) {
      // Animate back to idle shimmer
      const resets = animations.map((anim, i) =>
        Animated.timing(anim, {
          toValue: 0.08 + seededRand(i) * 0.2,
          duration: 300,
          useNativeDriver: false,
        })
      );
      Animated.parallel(resets).start();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(async () => {
      try {
        const status = await recording.getStatusAsync();
        if (!status.isRecording) return;

        // metering gives averagePowerDecibels (-160..0)
        const db = (status as any).metering ?? -50;
        const baseAmplitude = dbToAmplitude(db);

        // Drive bars: centre bars get more amplitude, edges less
        const targetAnims = animations.map((anim, i) => {
          const centre = barCount / 2;
          const dist = Math.abs(i - centre) / centre;
          const spread = Math.max(0.2, 1 - dist * 0.5);
          const noise = seededRand(i + Date.now() % 1000) * 0.15;
          const target = Math.min(1, baseAmplitude * spread + noise + 0.04);
          return Animated.timing(anim, {
            toValue: target,
            duration: 80,
            useNativeDriver: false,
          });
        });
        Animated.parallel(targetAnims).start();
      } catch {}
    }, 80);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, recording]);

  return (
    <View style={[styles.nativeContainer, { height }]}>
      {animations.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: color,
              height: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [2, height],
              }),
              opacity: active ? 1 : 0.4,
            },
          ]}
        />
      ))}
    </View>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface LiveWaveformVisualizerProps {
  active: boolean;
  color?: string;
  barCount?: number;
  height?: number;
  /** Web only — MediaStream from getUserMedia */
  stream?: MediaStream | null;
  /** Native only — expo-av Recording instance */
  recording?: Audio.Recording | null;
}

export function LiveWaveformVisualizer({
  active,
  color = "#7B2FFF",
  barCount = 50,
  height = 100,
  stream = null,
  recording = null,
}: LiveWaveformVisualizerProps) {
  if (IS_WEB) {
    return (
      <WebVisualizer
        stream={stream}
        active={active}
        color={color}
        barCount={barCount}
        height={height}
      />
    );
  }
  return (
    <NativeVisualizer
      recording={recording}
      active={active}
      color={color}
      barCount={barCount}
      height={height}
    />
  );
}

const styles = StyleSheet.create({
  nativeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    minHeight: 2,
  },
});
