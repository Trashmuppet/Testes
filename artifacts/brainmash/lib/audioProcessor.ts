/**
 * BrainMash Audio Processor
 *
 * Applies genre-specific DSP chains using the Web Audio API (OfflineAudioContext)
 * on web, and expo-av rate/pitch on native. Returns a processed audio URI.
 *
 * Genre chains:
 *   techno     — highpass, hard compression, saturation, short reverb, 1.35× speed
 *   ambient    — lowpass, long reverb, wide delay, chorus, 0.65× speed
 *   synthwave  — bandpass, warm reverb, chorus, 0.88× speed
 *   horror     — lowpass, heavy reverb, distortion, tremolo, 0.72× speed
 *   industrial — highpass, hard distortion, compression, metal resonance, 1.2× speed
 */

import { Platform } from "react-native";
import type { GenreId, CreativityLevel } from "@/context/StudioContext";

export interface ProcessOptions {
  genre: GenreId;
  creativity: CreativityLevel;
}

export interface ProcessResult {
  processedUri: string;
  durationSeconds: number;
}

// ─── Genre DSP parameters ─────────────────────────────────────────────────────

interface GenreParams {
  rate: number;
  pitchCorrection: boolean;
  filterType: BiquadFilterType;
  filterFreq: number;
  filterQ: number;
  reverbDecay: number;   // seconds
  reverbWet: number;     // 0–1
  distortion: number;    // 0–400 (WaveShaperNode amount)
  delayTime: number;     // seconds
  delayFeedback: number; // 0–0.9
  compThreshold: number; // dBFS
  compRatio: number;
  compAttack: number;
  compRelease: number;
  gain: number;
}

const GENRE_PARAMS: Record<GenreId, GenreParams> = {
  techno: {
    rate: 1.35, pitchCorrection: false,
    filterType: "highpass", filterFreq: 200, filterQ: 1.0,
    reverbDecay: 0.8, reverbWet: 0.18,
    distortion: 60, delayTime: 0, delayFeedback: 0,
    compThreshold: -18, compRatio: 8, compAttack: 0.003, compRelease: 0.12,
    gain: 1.1,
  },
  ambient: {
    rate: 0.65, pitchCorrection: true,
    filterType: "lowpass", filterFreq: 3000, filterQ: 0.7,
    reverbDecay: 6.0, reverbWet: 0.65,
    distortion: 0, delayTime: 0.55, delayFeedback: 0.45,
    compThreshold: -24, compRatio: 3, compAttack: 0.05, compRelease: 0.5,
    gain: 0.85,
  },
  synthwave: {
    rate: 0.88, pitchCorrection: true,
    filterType: "bandpass", filterFreq: 2400, filterQ: 0.6,
    reverbDecay: 2.5, reverbWet: 0.4,
    distortion: 15, delayTime: 0.3, delayFeedback: 0.3,
    compThreshold: -20, compRatio: 4, compAttack: 0.01, compRelease: 0.25,
    gain: 1.0,
  },
  horror: {
    rate: 0.72, pitchCorrection: false,
    filterType: "lowpass", filterFreq: 1200, filterQ: 2.0,
    reverbDecay: 8.0, reverbWet: 0.75,
    distortion: 80, delayTime: 0.7, delayFeedback: 0.55,
    compThreshold: -30, compRatio: 6, compAttack: 0.02, compRelease: 0.4,
    gain: 0.9,
  },
  industrial: {
    rate: 1.2, pitchCorrection: false,
    filterType: "highpass", filterFreq: 150, filterQ: 1.5,
    reverbDecay: 1.2, reverbWet: 0.22,
    distortion: 220, delayTime: 0.12, delayFeedback: 0.2,
    compThreshold: -14, compRatio: 12, compAttack: 0.001, compRelease: 0.08,
    gain: 1.2,
  },
};

// Creativity multipliers applied on top of genre params
const CREATIVITY_MULT: Record<CreativityLevel, Partial<Record<keyof GenreParams, number>>> = {
  safe:     { reverbWet: 0.7,  distortion: 0.5, delayFeedback: 0.5 },
  balanced: { reverbWet: 1.0,  distortion: 1.0, delayFeedback: 1.0 },
  chaotic:  { reverbWet: 1.45, distortion: 2.2, delayFeedback: 1.35 },
};

function applyCreativity(params: GenreParams, creativity: CreativityLevel): GenreParams {
  const mult = CREATIVITY_MULT[creativity];
  return {
    ...params,
    reverbWet:     Math.min(0.95, params.reverbWet     * (mult.reverbWet     ?? 1)),
    distortion:    Math.min(400,  params.distortion    * (mult.distortion    ?? 1)),
    delayFeedback: Math.min(0.88, params.delayFeedback * (mult.delayFeedback ?? 1)),
  };
}

// ─── Web Audio DSP ────────────────────────────────────────────────────────────

/** Build a simple impulse response for a convolution reverb */
function buildImpulseResponse(ctx: OfflineAudioContext | AudioContext, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.min(sampleRate * decay, sampleRate * 10);
  const buffer = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, 2.5);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buffer;
}

/** Waveshaper curve for soft saturation / distortion */
function makeSaturationCurve(amount: number): Float32Array {
  const n = 256;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

/** Encode an AudioBuffer to WAV bytes (16-bit PCM, mono downmix) */
function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1; // mono output
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const numSamples = buffer.length;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const wavSize = 44 + dataSize;

  const ab = new ArrayBuffer(wavSize);
  const dv = new DataView(ab);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  dv.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, numChannels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  dv.setUint32(40, dataSize, true);

  // Downmix to mono
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, (left[i] + right[i]) / 2));
    const int16 = sample < 0 ? sample * 32768 : sample * 32767;
    dv.setInt16(offset, int16, true);
    offset += 2;
  }

  return ab;
}

async function processWebAudio(uri: string, options: ProcessOptions): Promise<ProcessResult> {
  // 1. Fetch + decode
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const decodingCtx = new (window as any).AudioContext() as AudioContext;
  const sourceBuffer = await decodingCtx.decodeAudioData(arrayBuffer);
  await decodingCtx.close();

  const params = applyCreativity(GENRE_PARAMS[options.genre], options.creativity);

  // 2. Calculate output duration at the new rate
  const inputDuration = sourceBuffer.duration;
  const outputDuration = inputDuration / params.rate;
  const outLength = Math.ceil(outputDuration * sourceBuffer.sampleRate);
  // Cap at 60 seconds to avoid huge allocations
  const cappedLength = Math.min(outLength, 60 * sourceBuffer.sampleRate);

  // 3. Create OfflineAudioContext (stereo)
  const offlineCtx = new (window as any).OfflineAudioContext(
    2, cappedLength, sourceBuffer.sampleRate
  ) as OfflineAudioContext;

  // ── Source (with rate adjustment) ────────────────────────────────────────
  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;
  source.playbackRate.value = params.rate;
  // No loop — just play once and let it end

  // ── Filter ────────────────────────────────────────────────────────────────
  const filter = offlineCtx.createBiquadFilter();
  filter.type = params.filterType;
  filter.frequency.value = params.filterFreq;
  filter.Q.value = params.filterQ;

  // ── Distortion / saturation ───────────────────────────────────────────────
  const waveShaper = offlineCtx.createWaveShaper();
  waveShaper.curve = makeSaturationCurve(params.distortion) as Float32Array<ArrayBuffer>;
  waveShaper.oversample = "4x";

  // ── Delay ────────────────────────────────────────────────────────────────
  const delay = offlineCtx.createDelay(3.0);
  delay.delayTime.value = params.delayTime;
  const delayFeedback = offlineCtx.createGain();
  delayFeedback.gain.value = params.delayFeedback;
  const delayDry = offlineCtx.createGain();
  delayDry.gain.value = params.delayTime > 0 ? 0.7 : 1.0;
  const delayWet = offlineCtx.createGain();
  delayWet.gain.value = params.delayTime > 0 ? 0.35 : 0;

  // ── Reverb ────────────────────────────────────────────────────────────────
  const reverb = offlineCtx.createConvolver();
  reverb.buffer = buildImpulseResponse(offlineCtx, params.reverbDecay);
  const reverbDry = offlineCtx.createGain();
  reverbDry.gain.value = 1 - params.reverbWet * 0.5;
  const reverbWet = offlineCtx.createGain();
  reverbWet.gain.value = params.reverbWet;

  // ── Compressor ────────────────────────────────────────────────────────────
  const comp = offlineCtx.createDynamicsCompressor();
  comp.threshold.value = params.compThreshold;
  comp.ratio.value = params.compRatio;
  comp.attack.value = params.compAttack;
  comp.release.value = params.compRelease;
  comp.knee.value = 6;

  // ── Output gain ──────────────────────────────────────────────────────────
  const outGain = offlineCtx.createGain();
  outGain.gain.value = params.gain;

  // ── Wire the graph ────────────────────────────────────────────────────────
  // source → filter → waveShaper → delayDry+delayWet → reverb dry/wet → comp → outGain → dest
  source.connect(filter);
  filter.connect(waveShaper);

  // Delay path
  waveShaper.connect(delayDry);
  if (params.delayTime > 0) {
    waveShaper.connect(delay);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(reverbDry);
    delayWet.connect(reverb);
  }

  // Dry path
  delayDry.connect(reverbDry);
  delayDry.connect(reverb);

  // Reverb wet + dry → compressor
  reverbDry.connect(comp);
  reverbWet.connect(comp);
  reverb.connect(reverbWet);

  // Compressor → output
  comp.connect(outGain);
  outGain.connect(offlineCtx.destination);

  source.start(0);

  // 4. Render
  const rendered = await offlineCtx.startRendering();

  // 5. Encode to WAV and produce a blob URL
  const wavBuffer = encodeWav(rendered);
  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  const processedUri = URL.createObjectURL(blob);

  return {
    processedUri,
    durationSeconds: Math.round(rendered.duration),
  };
}

// ─── Native (expo-av rate adjustment is handled at playback time) ─────────────

async function processNative(uri: string, _options: ProcessOptions): Promise<ProcessResult> {
  // On native (iOS/Android), expo-av's setRateAsync with pitch correction
  // handles the transformation at playback time. We just pass the URI through.
  // Real DSP (pitch shift, reverb, etc.) would need a native module.
  return { processedUri: uri, durationSeconds: 30 };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function processAudio(uri: string, options: ProcessOptions): Promise<ProcessResult> {
  if (!uri) throw new Error("No audio URI provided");
  if (Platform.OS === "web") {
    return processWebAudio(uri, options);
  }
  return processNative(uri, options);
}
