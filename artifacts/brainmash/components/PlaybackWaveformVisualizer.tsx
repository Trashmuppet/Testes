/**
 * PlaybackWaveformVisualizer
 *
 * Real-time frequency visualizer for the result/playback screen.
 *
 * Web:    Taps the playing HTMLAudioElement via MediaElementAudioSourceNode +
 *         AnalyserNode, draws two canvas layers at 60fps:
 *           1. Echo/ghost bars — peak-hold with exponential decay (~8%/frame)
 *           2. Live bars       — current frame frequency amplitude
 *
 * Native: Two sets of Animated.Values — live bars (normal animation speed) and
 *         peak/ghost bars (slow decay), giving the same retro oscilloscope feel.
 *
 * Props:
 *   audioElement — HTMLAudioElement from webAudioRef (web only; pass as state)
 *   isPlaying    — controls animation / decay direction
 *   color        — primary bar + echo tint
 *   barCount     — number of bars (default 44)
 *   height       — px height (default 80)
 *   seed         — used for idle shimmer pattern (native) and fallback idle (web)
 */

import { Audio } from "expo-av";
import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";

const IS_WEB = Platform.OS === "web";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seededRand(i: number, seed: number = 1): number {
  const x = Math.sin(seed * 9301 + i * 49297 + 233720) * 439.5;
  return x - Math.floor(x);
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// ─── Web canvas visualizer ─────────────────────────────────────────────────────

interface WebPlaybackVisualizerProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  color: string;
  barCount: number;
  height: number;
  seed: number;
}

// Keep a WeakMap so we only create one MediaElementSourceNode per element
const sourceNodeMap = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
const audioCtxMap  = new WeakMap<HTMLAudioElement, AudioContext>();

function WebPlaybackVisualizer({
  audioElement,
  isPlaying,
  color,
  barCount,
  height,
  seed,
}: WebPlaybackVisualizerProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const peaksRef   = useRef<Float32Array>(new Float32Array(barCount).fill(0));
  const idlePhaseRef = useRef(0);

  // Colour helpers
  let rgb: [number, number, number] = [123, 47, 255];
  try { rgb = hexToRgb(color); } catch {}
  const [r, g, b] = rgb;

  // Build / tear down the analyser node whenever audioElement changes
  useEffect(() => {
    analyserRef.current = null;
    if (!audioElement) return;

    let ctx: AudioContext;
    let analyser: AnalyserNode;
    let source: MediaElementAudioSourceNode;

    try {
      // Reuse existing context if possible (one source node per element)
      if (audioCtxMap.has(audioElement)) {
        ctx = audioCtxMap.get(audioElement)!;
      } else {
        ctx = new AudioContext();
        audioCtxMap.set(audioElement, ctx);
      }

      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;

      if (sourceNodeMap.has(audioElement)) {
        source = sourceNodeMap.get(audioElement)!;
      } else {
        source = ctx.createMediaElementSource(audioElement);
        sourceNodeMap.set(audioElement, source);
        // Always route through analyser → destination so audio still plays
        source.connect(analyser);
        analyser.connect(ctx.destination);
      }

      analyserRef.current = analyser;

      // Resume context on first interaction (browsers require user gesture)
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    } catch {
      // Cross-origin or already-connected element — visualizer degrades gracefully
    }
  }, [audioElement]);

  // Resume context when playback starts
  useEffect(() => {
    if (!audioElement || !isPlaying) return;
    const ctx = audioCtxMap.get(audioElement);
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
  }, [isPlaying, audioElement]);

  // rAF draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    // Reset peaks when audio changes
    peaksRef.current = new Float32Array(barCount).fill(0);

    const dataArray = new Uint8Array(analyserRef.current?.frequencyBinCount ?? 256);
    const DECAY = 0.91;    // how fast echo fades per frame
    const FLOOR = 0.04;    // minimum echo bar height

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      const analyser = analyserRef.current;
      const barW = Math.max(1, (w - (barCount - 1) * 3) / barCount);

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
        const usableBins = Math.floor(dataArray.length * 0.70);
        const step = usableBins / barCount;

        for (let i = 0; i < barCount; i++) {
          const binIndex = Math.floor(i * step);
          const raw = dataArray[binIndex] / 255;
          const live = Math.pow(Math.max(0, raw), 0.65);

          // Update peak
          const peaks = peaksRef.current;
          if (live > peaks[i]) {
            peaks[i] = live;
          } else {
            peaks[i] = Math.max(FLOOR, peaks[i] * DECAY);
          }

          const x = i * (barW + 3);
          const radius = Math.min(barW / 2, 3);

          // ── Echo / ghost bar (drawn first, behind live bar) ──
          const echoH = Math.max(2, peaks[i] * h);
          const echoY = (h - echoH) / 2;
          ctx2d.fillStyle = `rgba(${r},${g},${b},0.22)`;
          ctx2d.beginPath();
          ctx2d.roundRect(x, echoY, barW, echoH, radius);
          ctx2d.fill();

          // ── Live bar ──
          const liveH = Math.max(2, live * h);
          const liveY = (h - liveH) / 2;
          ctx2d.fillStyle = `rgba(${r},${g},${b},1)`;
          ctx2d.beginPath();
          ctx2d.roundRect(x, liveY, barW, liveH, radius);
          ctx2d.fill();
        }
      } else {
        // Decay all peaks toward idle shimmer
        idlePhaseRef.current += 0.018;
        const peaks = peaksRef.current;

        for (let i = 0; i < barCount; i++) {
          const idleTarget = 0.07 + seededRand(i, seed) * 0.18 +
            Math.sin(idlePhaseRef.current + i * 0.45) * 0.03;
          peaks[i] = peaks[i] * 0.88 + idleTarget * 0.12;

          const x = i * (barW + 3);
          const radius = Math.min(barW / 2, 3);

          // Echo layer (very subtle when idle)
          const echoH = Math.max(2, (peaks[i] + 0.05) * h);
          const echoY = (h - echoH) / 2;
          ctx2d.fillStyle = `rgba(${r},${g},${b},0.12)`;
          ctx2d.beginPath();
          ctx2d.roundRect(x, echoY, barW, echoH, radius);
          ctx2d.fill();

          // Idle bar
          const liveH = Math.max(2, peaks[i] * h);
          const liveY = (h - liveH) / 2;
          ctx2d.fillStyle = `rgba(${r},${g},${b},0.38)`;
          ctx2d.beginPath();
          ctx2d.roundRect(x, liveY, barW, liveH, radius);
          ctx2d.fill();
        }
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  // Intentionally shallow — the rAF loop reads analyserRef / peaksRef by ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, color, barCount, seed]);

  return (
    <canvas
      ref={canvasRef}
      width={880}
      height={height * 2}
      style={{ width: "100%", height, display: "block" }}
    />
  );
}

// ─── Native Animated visualizer with ghost bars ───────────────────────────────

interface NativePlaybackVisualizerProps {
  isPlaying: boolean;
  color: string;
  barCount: number;
  height: number;
  seed: number;
}

function NativePlaybackVisualizer({
  isPlaying,
  color,
  barCount,
  height,
  seed,
}: NativePlaybackVisualizerProps) {
  // Live bars — animate at normal speed when playing
  const liveAnims = useRef<Animated.Value[]>(
    Array.from({ length: barCount }, (_, i) =>
      new Animated.Value(0.08 + seededRand(i, seed) * 0.3)
    )
  ).current;

  // Peak/ghost bars — higher values, decay slowly
  const peakAnims = useRef<Animated.Value[]>(
    Array.from({ length: barCount }, (_, i) =>
      new Animated.Value(0.12 + seededRand(i, seed) * 0.35)
    )
  ).current;

  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    loopsRef.current.forEach((l) => l.stop());
    loopsRef.current = [];

    if (!isPlaying) {
      // Decay back to idle shimmer
      const resets = liveAnims.map((anim, i) =>
        Animated.timing(anim, {
          toValue: 0.08 + seededRand(i, seed) * 0.2,
          duration: 500,
          useNativeDriver: false,
        })
      );
      const peakResets = peakAnims.map((anim, i) =>
        Animated.timing(anim, {
          toValue: 0.12 + seededRand(i, seed) * 0.25,
          duration: 900,
          useNativeDriver: false,
        })
      );
      Animated.parallel([...resets, ...peakResets]).start();
      return;
    }

    // Animate live bars at normal music speed
    const liveLops = liveAnims.map((anim, i) => {
      const minH = 0.06 + seededRand(i, seed) * 0.18;
      const maxH = 0.45 + seededRand(i + barCount, seed) * 0.55;
      const dur   = 180 + seededRand(i + barCount * 2, seed) * 340;
      const delay = seededRand(i + barCount * 3, seed) * 200;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: maxH, duration: dur, useNativeDriver: false }),
          Animated.timing(anim, { toValue: minH, duration: dur * 1.1, useNativeDriver: false }),
        ])
      );
    });

    // Peak/ghost bars — slower, higher ceiling, longer duration
    const peakLoops = peakAnims.map((anim, i) => {
      const minH = 0.18 + seededRand(i, seed) * 0.22;
      const maxH = 0.65 + seededRand(i + barCount, seed) * 0.35;
      const dur   = 500 + seededRand(i + barCount * 4, seed) * 700;
      const delay = seededRand(i + barCount * 5, seed) * 400;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: maxH, duration: dur, useNativeDriver: false }),
          Animated.timing(anim, { toValue: minH, duration: dur * 1.4, useNativeDriver: false }),
        ])
      );
    });

    loopsRef.current = [...liveLops, ...peakLoops];
    loopsRef.current.forEach((l) => l.start());

    return () => { loopsRef.current.forEach((l) => l.stop()); };
  }, [isPlaying, seed]);

  return (
    <View style={[styles.nativeContainer, { height }]}>
      {liveAnims.map((liveAnim, i) => (
        <View key={i} style={styles.barSlot}>
          {/* Ghost / echo bar behind */}
          <Animated.View
            style={[
              styles.bar,
              {
                position: "absolute",
                backgroundColor: color,
                opacity: 0.22,
                height: peakAnims[i].interpolate({
                  inputRange: [0, 1],
                  outputRange: [2, height],
                }),
              },
            ]}
          />
          {/* Live bar in front */}
          <Animated.View
            style={[
              styles.bar,
              {
                backgroundColor: color,
                height: liveAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [2, height],
                }),
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface PlaybackWaveformVisualizerProps {
  isPlaying: boolean;
  color?: string;
  barCount?: number;
  height?: number;
  seed?: number;
  /** Web only — the HTMLAudioElement currently being played */
  audioElement?: HTMLAudioElement | null;
}

export function PlaybackWaveformVisualizer({
  isPlaying,
  color = "#7B2FFF",
  barCount = 44,
  height = 80,
  seed = 1,
  audioElement = null,
}: PlaybackWaveformVisualizerProps) {
  if (IS_WEB) {
    return (
      <WebPlaybackVisualizer
        audioElement={audioElement}
        isPlaying={isPlaying}
        color={color}
        barCount={barCount}
        height={height}
        seed={seed}
      />
    );
  }
  return (
    <NativePlaybackVisualizer
      isPlaying={isPlaying}
      color={color}
      barCount={barCount}
      height={height}
      seed={seed}
    />
  );
}

const styles = StyleSheet.create({
  nativeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  barSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bar: {
    width: "100%",
    borderRadius: 2,
    minHeight: 2,
  },
});
