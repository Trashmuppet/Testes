import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import React, { useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import ViewShot, { ViewShotRef } from "react-native-view-shot";
import { useColors } from "@/hooks/useColors";
import { Creation, Genre, GENRES } from "@/context/StudioContext";

const IS_WEB = Platform.OS === "web";

// ─── Seeded bars (same formula as WaveformVisualizer) ────────────────────────
function seedRand(seed: number, i: number): number {
  const x = Math.sin(seed * 9301 + i * 49297 + 233720) * 439.5;
  return x - Math.floor(x);
}
function staticBars(seed: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => 0.1 + seedRand(seed, i) * 0.4);
}

// ─── Formats ─────────────────────────────────────────────────────────────────
const FORMATS = [
  { id: "square",    label: "Square",    desc: "1080×1080 · Instagram", icon: "square" },
  { id: "portrait",  label: "Portrait",  desc: "1080×1920 · TikTok/Reels", icon: "smartphone" },
  { id: "landscape", label: "Landscape", desc: "1920×1080 · YouTube", icon: "monitor" },
] as const;
type Format = typeof FORMATS[number]["id"];

function formatDims(fmt: Format): { W: number; H: number } {
  if (fmt === "portrait")  return { W: 1080, H: 1920 };
  if (fmt === "landscape") return { W: 1920, H: 1080 };
  return { W: 1080, H: 1080 };
}

// ─── Web canvas download ──────────────────────────────────────────────────────
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

function drawAndDownload(creation: Creation, genre: Genre, fmt: Format) {
  const { W, H } = formatDims(fmt);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, W, H);

  // Genre colour glow from top
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 0.55);
  glow.addColorStop(0, genre.color + "44");
  glow.addColorStop(1, "#0a0a0f00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Top strip
  ctx.fillStyle = genre.color;
  ctx.fillRect(0, 0, W, 8);

  // Grid dots pattern (subtle)
  ctx.fillStyle = "#ffffff08";
  const dotGap = 48;
  for (let dx = 0; dx < W; dx += dotGap) {
    for (let dy = 0; dy < H; dy += dotGap) {
      ctx.beginPath();
      ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const pad = W * 0.074;

  // BrainMash logo
  const logoSize = Math.round(W * 0.062);
  ctx.font = `bold ${logoSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = genre.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("BrainMash", pad, pad);

  // Genre badge
  const badgeY = pad + logoSize + W * 0.022;
  const badgeFontSize = Math.round(W * 0.032);
  ctx.font = `600 ${badgeFontSize}px system-ui, -apple-system, sans-serif`;
  const genreTextW = ctx.measureText(genre.name).width;
  const badgePad = W * 0.022;
  const badgeW = genreTextW + badgePad * 2;
  const badgeH = badgeFontSize * 1.8;
  ctx.fillStyle = genre.color + "33";
  roundRectPath(ctx, pad, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.fillStyle = genre.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(genre.name, pad + badgePad, badgeY + badgeH / 2);

  // ── Waveform ──────────────────────────────────────────────────────────────
  const bars = staticBars(creation.waveformSeed, 52);
  const waveX = pad;
  const waveW = W - pad * 2;
  const waveH = H * 0.18;
  const waveY = H * (fmt === "portrait" ? 0.36 : 0.33);
  const barW = waveW / bars.length;
  const barGap = barW * 0.28;

  bars.forEach((h, i) => {
    const bh = Math.max(h * waveH, 4);
    const bx = waveX + i * barW;
    const by = waveY + (waveH - bh) / 2;
    const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
    grad.addColorStop(0, genre.color + "ff");
    grad.addColorStop(1, genre.color + "33");
    ctx.fillStyle = grad;
    roundRectPath(ctx, bx, by, barW - barGap, bh, 3);
    ctx.fill();
  });

  // ── Track name ────────────────────────────────────────────────────────────
  const trackFontSize = Math.round(W * 0.068);
  ctx.font = `bold ${trackFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const trackY = waveY + waveH + H * 0.06;
  const maxTW = W - pad * 2;
  const words = creation.name.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur + (cur ? " " : "") + w;
    if (ctx.measureText(test).width > maxTW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  lines.push(cur);
  const lh = trackFontSize * 1.25;
  lines.forEach((line, li) => ctx.fillText(line, W / 2, trackY + li * lh));

  // Genre · Creativity
  const subFontSize = Math.round(W * 0.036);
  ctx.font = `${subFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = genre.color;
  ctx.textBaseline = "top";
  ctx.fillText(
    `${genre.name} · ${creation.creativity.charAt(0).toUpperCase() + creation.creativity.slice(1)}`,
    W / 2,
    trackY + lines.length * lh + H * 0.028
  );

  // ── Bottom ────────────────────────────────────────────────────────────────
  ctx.strokeStyle = "#1e1e2e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, H - H * 0.1);
  ctx.lineTo(W - pad, H - H * 0.1);
  ctx.stroke();

  const tagFontSize = Math.round(W * 0.026);
  ctx.font = `${tagFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = "#6B6B8A";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Turn Any Sound Into Music · brainmash.app", W / 2, H - H * 0.055);

  // Bottom strip
  ctx.fillStyle = genre.color;
  ctx.fillRect(0, H - 8, W, 8);

  // Download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${creation.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")}_brainmash.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, "image/png");
}

// ─── Card preview (React Native view, also captured by ViewShot) ──────────────
function ShareCardPreview({
  creation,
  genre,
  width,
}: {
  creation: Creation;
  genre: Genre;
  width: number;
}) {
  const bars = staticBars(creation.waveformSeed, 44);
  const waveHeight = width * 0.2;

  return (
    <View style={[styles.card, { width, height: width, backgroundColor: "#0a0a0f", overflow: "hidden" }]}>
      {/* Top strip */}
      <View style={{ height: 4, backgroundColor: genre.color }} />

      {/* Glow overlay */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: genre.color + "18" }]} pointerEvents="none" />

      {/* Dot grid */}
      <View style={[StyleSheet.absoluteFill, styles.dotGrid]} pointerEvents="none">
        {Array.from({ length: 6 }, (_, row) => (
          <View key={row} style={styles.dotRow}>
            {Array.from({ length: 8 }, (_, col) => (
              <View key={col} style={styles.dot} />
            ))}
          </View>
        ))}
      </View>

      <View style={[styles.cardInner, { padding: width * 0.074 }]}>
        {/* Header */}
        <Text style={[styles.cardLogo, { color: genre.color, fontSize: width * 0.065 }]}>
          BrainMash
        </Text>
        <View style={[styles.cardGenreBadge, { backgroundColor: genre.color + "33" }]}>
          <Feather name={genre.icon as any} size={width * 0.032} color={genre.color} />
          <Text style={[styles.cardGenreText, { color: genre.color, fontSize: width * 0.032 }]}>
            {genre.name}
          </Text>
        </View>

        {/* Waveform */}
        <View style={[styles.waveRow, { height: waveHeight, marginTop: width * 0.06 }]}>
          {bars.map((h, i) => {
            const bh = Math.max(h * waveHeight, 2);
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: bh,
                  backgroundColor: genre.color,
                  opacity: 0.6 + h * 0.4,
                  borderRadius: 2,
                  marginHorizontal: 1,
                  alignSelf: "center",
                }}
              />
            );
          })}
        </View>

        {/* Track name */}
        <Text
          style={[styles.cardTrackName, { color: "#fff", fontSize: width * 0.068, marginTop: width * 0.06 }]}
          numberOfLines={2}
          adjustsFontSizeToFit
        >
          {creation.name}
        </Text>

        {/* Subtitle */}
        <Text style={[styles.cardSub, { color: genre.color, fontSize: width * 0.034 }]}>
          {genre.name} ·{" "}
          {creation.creativity.charAt(0).toUpperCase() + creation.creativity.slice(1)}
        </Text>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Footer */}
        <View style={[styles.cardFooter, { borderTopColor: "#1e1e2e" }]}>
          <Text style={[styles.cardTagline, { color: "#6B6B8A", fontSize: width * 0.026 }]}>
            Turn Any Sound Into Music · brainmash.app
          </Text>
        </View>
      </View>

      {/* Bottom strip */}
      <View style={{ height: 4, backgroundColor: genre.color }} />
    </View>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function ShareCardModal({
  creation,
  visible,
  onClose,
}: {
  creation: Creation | null;
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const { width: screenW } = useWindowDimensions();
  const [format, setFormat] = useState<Format>("square");
  const [sharing, setSharing] = useState(false);
  const [done, setDone] = useState(false);
  const viewShotRef = useRef<ViewShotRef>(null);

  if (!creation) return null;
  const genre = GENRES.find((g) => g.id === creation.genre)!;
  const cardWidth = screenW - 48;

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSharing(true);
    setDone(false);

    try {
      if (IS_WEB) {
        drawAndDownload(creation, genre, format);
        setDone(true);
        setTimeout(() => setDone(false), 2500);
      } else {
        const uri = await (viewShotRef.current as any)?.capture?.();
        if (uri && (await Sharing.isAvailableAsync())) {
          await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: creation.name });
        }
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }
    } catch {}

    setSharing(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.88)" }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Share Card</Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Feather name="x" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { backgroundColor: colors.background }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Card preview */}
          <View style={styles.previewWrap}>
            <ViewShot ref={viewShotRef} options={{ format: "png", quality: 1.0 }}>
              <ShareCardPreview creation={creation} genre={genre} width={cardWidth} />
            </ViewShot>
          </View>

          {/* Format selector */}
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Format</Text>
          <View style={styles.formatsRow}>
            {FORMATS.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFormat(f.id);
                }}
                style={({ pressed }) => [
                  styles.formatCard,
                  {
                    backgroundColor: format === f.id ? genre.color + "22" : colors.card,
                    borderColor: format === f.id ? genre.color : colors.cardBorder,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Feather name={f.icon as any} size={18} color={format === f.id ? genre.color : colors.mutedForeground} />
                <Text style={[styles.formatLabel, { color: format === f.id ? genre.color : colors.text }]}>
                  {f.label}
                </Text>
                <Text style={[styles.formatDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {f.desc}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Share / Download button */}
          <Pressable
            onPress={handleShare}
            disabled={sharing}
            style={({ pressed }) => [
              styles.shareBtn,
              {
                backgroundColor: done ? colors.success : genre.color,
                shadowColor: done ? colors.success : genre.color,
                opacity: pressed || sharing ? 0.85 : 1,
              },
            ]}
          >
            {sharing ? (
              <>
                <Animated.View style={styles.spinnerDot} />
                <Text style={styles.shareBtnText}>Generating…</Text>
              </>
            ) : done ? (
              <>
                <Feather name="check" size={20} color="#fff" />
                <Text style={styles.shareBtnText}>
                  {IS_WEB ? "Downloaded!" : "Shared!"}
                </Text>
              </>
            ) : (
              <>
                <Feather name={IS_WEB ? "download" : "share-2"} size={20} color="#fff" />
                <Text style={styles.shareBtnText}>
                  {IS_WEB ? `Download ${format === "square" ? "Square" : format === "portrait" ? "Portrait" : "Landscape"}` : "Share Image"}
                </Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.sizeHint, { color: colors.mutedForeground }]}>
            {(() => {
              const d = formatDims(format);
              return `Exports at ${d.W}×${d.H}px · PNG`;
            })()}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  scrollContent: { padding: 20, paddingBottom: 48 },
  previewWrap: { alignItems: "center", marginBottom: 24, borderRadius: 16, overflow: "hidden" },
  sectionLabel: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 12 },
  formatsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  formatCard: {
    flex: 1, borderRadius: 14, borderWidth: 1,
    padding: 12, alignItems: "center", gap: 5,
  },
  formatLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  formatDesc: { fontSize: 10, fontFamily: "Inter_400Regular", textAlign: "center" },
  shareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
    borderRadius: 28, paddingVertical: 18,
    shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 8,
    marginBottom: 10,
  },
  shareBtnText: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#fff" },
  spinnerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ffffff88" },
  sizeHint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  // Card
  card: { borderRadius: 0 },
  cardInner: { flex: 1 },
  cardLogo: { fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 8 },
  cardGenreBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  cardGenreText: { fontFamily: "Inter_600SemiBold" },
  waveRow: { flexDirection: "row", alignItems: "center", overflow: "hidden" },
  cardTrackName: { fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 6 },
  cardSub: { fontFamily: "Inter_600SemiBold" },
  cardFooter: { borderTopWidth: 1, paddingTop: 10, marginTop: 8 },
  cardTagline: { fontFamily: "Inter_400Regular", textAlign: "center" },
  dotGrid: { paddingTop: 8, gap: 20 },
  dotRow: { flexDirection: "row", justifyContent: "space-around" },
  dot: { width: 2, height: 2, borderRadius: 1, backgroundColor: "#ffffff10" },
});
