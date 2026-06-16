import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

// ─── Genre System ─────────────────────────────────────────────────────────────

export type GenreId = "techno" | "ambient" | "synthwave" | "horror" | "industrial";

export interface Genre {
  id: GenreId;
  name: string;
  tagline: string;
  focus: string[];
  color: string;
  bpm: string;
  icon: string;
  rate: number;
  pitchCorrection: boolean;
}

export const GENRES: Genre[] = [
  {
    id: "techno",
    name: "Techno",
    tagline: "Driving drums. Deep bass. Relentless.",
    focus: ["Driving drums", "Deep bass", "Repetition"],
    color: "#7B2FFF",
    bpm: "128–140 BPM",
    icon: "zap",
    rate: 1.35,
    pitchCorrection: false,
  },
  {
    id: "ambient",
    name: "Ambient",
    tagline: "Dissolve into sound.",
    focus: ["Atmospheres", "Long textures", "Minimal rhythm"],
    color: "#00F5FF",
    bpm: "60–80 BPM",
    icon: "cloud",
    rate: 0.65,
    pitchCorrection: true,
  },
  {
    id: "synthwave",
    name: "Synthwave",
    tagline: "Retro future. Neon horizons.",
    focus: ["Retro synths", "Arpeggios", "Melodic hooks"],
    color: "#FF2D87",
    bpm: "95–115 BPM",
    icon: "radio",
    rate: 0.88,
    pitchCorrection: true,
  },
  {
    id: "horror",
    name: "Horror",
    tagline: "Drones. Dissonance. Dread.",
    focus: ["Drones", "Dissonance", "Unease"],
    color: "#FF3344",
    bpm: "50–70 BPM",
    icon: "alert-triangle",
    rate: 0.72,
    pitchCorrection: false,
  },
  {
    id: "industrial",
    name: "Industrial",
    tagline: "Distortion. Metal. Aggression.",
    focus: ["Distortion", "Metallic percussion", "Aggressive rhythms"],
    color: "#FF8C00",
    bpm: "120–140 BPM",
    icon: "tool",
    rate: 1.2,
    pitchCorrection: false,
  },
];

// ─── Creativity Levels ────────────────────────────────────────────────────────

export type CreativityLevel = "safe" | "balanced" | "chaotic";

export interface CreativityOption {
  id: CreativityLevel;
  label: string;
  description: string;
  icon: string;
}

export const CREATIVITY_OPTIONS: CreativityOption[] = [
  {
    id: "safe",
    label: "Safe",
    description: "Genre-faithful. Predictable structure.",
    icon: "shield",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Creative but coherent.",
    icon: "sliders",
  },
  {
    id: "chaotic",
    label: "Chaotic",
    description: "Experimental. Unexpected results.",
    icon: "shuffle",
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AudioFile {
  name: string;
  duration: number;
  uri: string;
  source: "recorded" | "imported";
}

export interface Creation {
  id: string;
  name: string;
  genre: GenreId;
  creativity: CreativityLevel;
  duration: number;
  createdAt: number;
  likes: number;
  isLiked: boolean;
  username: string;
  waveformSeed: number;
  audioUri: string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface StudioContextValue {
  audioFile: AudioFile | null;
  selectedGenre: GenreId;
  creativity: CreativityLevel;
  generating: boolean;
  currentCreation: Creation | null;
  myCreations: Creation[];
  feedCreations: Creation[];
  setAudioFile: (f: AudioFile | null) => void;
  selectGenre: (id: GenreId) => void;
  setCreativity: (c: CreativityLevel) => void;
  generate: () => Promise<void>;
  saveCreation: (name: string) => void;
  deleteCreation: (id: string) => void;
  toggleLike: (id: string) => void;
  clearAll: () => void;
  reset: () => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

const STORAGE_KEY = "@brainmash_v1_creations";

function makeFeedCreations(): Creation[] {
  const users = ["beatmaster_j", "synthwave_v", "noisegirl", "loopzilla", "the_droner", "glitch_babe", "tekno_rex"];
  const genres: GenreId[] = ["techno", "ambient", "synthwave", "horror", "industrial"];
  const creativities: CreativityLevel[] = ["safe", "balanced", "chaotic"];
  const names = [
    "Rain to Techno", "Dog Bark Ambient", "City Synthwave", "Voice Horror", "Kitchen Industrial",
    "Thunder Techno", "Traffic Ambient", "Crowd Horror", "Fridge Industrial", "Wind Synthwave",
    "Keyboard Techno", "River Ambient", "Clock Industrial", "Fire Horror", "Subway Techno",
    "Heartbeat Ambient", "Fan Synthwave", "Ocean Industrial", "Birdsong Ambient", "Scream Horror",
  ];
  return names.map((name, i) => ({
    id: `feed-${i}`,
    name,
    genre: genres[i % genres.length],
    creativity: creativities[i % creativities.length],
    duration: 15 + (i * 7) % 45,
    createdAt: Date.now() - i * 3_600_000,
    likes: 12 + (i * 37) % 488,
    isLiked: false,
    username: users[i % users.length],
    waveformSeed: (i * 12345 + 7) % 99999,
    audioUri: "",
  }));
}

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [audioFile, setAudioFile] = useState<AudioFile | null>(null);
  const [selectedGenre, selectGenre] = useState<GenreId>("techno");
  const [creativity, setCreativity] = useState<CreativityLevel>("balanced");
  const [generating, setGenerating] = useState(false);
  const [currentCreation, setCurrentCreation] = useState<Creation | null>(null);
  const [myCreations, setMyCreations] = useState<Creation[]>([]);
  const [feedCreations] = useState<Creation[]>(makeFeedCreations());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((data) => {
      if (data) { try { setMyCreations(JSON.parse(data)); } catch {} }
    });
  }, []);

  const persist = useCallback((next: Creation[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const generate = useCallback(async () => {
    if (!audioFile) return;
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 4500));
    const genre = GENRES.find((g) => g.id === selectedGenre)!;
    const creation: Creation = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 9),
      name: `${audioFile.name} — ${genre.name}`,
      genre: selectedGenre,
      creativity,
      duration: Math.min(60, audioFile.duration + 8),
      createdAt: Date.now(),
      likes: 0,
      isLiked: false,
      username: "you",
      waveformSeed: Math.floor(Math.random() * 99999),
      audioUri: audioFile.uri,
    };
    setCurrentCreation(creation);
    setGenerating(false);
  }, [audioFile, selectedGenre, creativity]);

  const saveCreation = useCallback((name: string) => {
    if (!currentCreation) return;
    const saved = { ...currentCreation, name };
    setMyCreations((prev) => { const next = [saved, ...prev]; persist(next); return next; });
  }, [currentCreation, persist]);

  const deleteCreation = useCallback((id: string) => {
    setMyCreations((prev) => { const next = prev.filter((c) => c.id !== id); persist(next); return next; });
  }, [persist]);

  const toggleLike = useCallback((id: string) => {
    setMyCreations((prev) =>
      prev.map((c) => c.id === id ? { ...c, isLiked: !c.isLiked, likes: c.isLiked ? c.likes - 1 : c.likes + 1 } : c)
    );
  }, []);

  const clearAll = useCallback(() => {
    setMyCreations([]);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const reset = useCallback(() => {
    setAudioFile(null);
    selectGenre("techno");
    setCreativity("balanced");
    setGenerating(false);
    setCurrentCreation(null);
  }, []);

  return (
    <StudioContext.Provider value={{
      audioFile, selectedGenre, creativity, generating, currentCreation,
      myCreations, feedCreations,
      setAudioFile, selectGenre, setCreativity, generate,
      saveCreation, deleteCreation, toggleLike, clearAll, reset,
    }}>
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within StudioProvider");
  return ctx;
}
