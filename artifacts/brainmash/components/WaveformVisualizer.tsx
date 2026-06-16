import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface WaveformVisualizerProps {
  active?: boolean;
  color?: string;
  barCount?: number;
  height?: number;
  seed?: number;
}

export function WaveformVisualizer({
  active = false,
  color,
  barCount = 40,
  height = 80,
  seed = 1,
}: WaveformVisualizerProps) {
  const colors = useColors();
  const barColor = color ?? colors.primary;
  const animations = useRef<Animated.Value[]>(
    Array.from({ length: barCount }, () => new Animated.Value(0.1))
  ).current;

  const seedRand = (i: number) => {
    const x = Math.sin(seed * 9301 + i * 49297 + 233720) * 439.5;
    return x - Math.floor(x);
  };

  useEffect(() => {
    if (!active) {
      const resets = animations.map((anim, i) => {
        const staticH = 0.1 + seedRand(i) * 0.4;
        return Animated.timing(anim, { toValue: staticH, duration: 200, useNativeDriver: false });
      });
      Animated.parallel(resets).start();
      return;
    }

    const loops: Animated.CompositeAnimation[] = animations.map((anim, i) => {
      const minH = 0.05 + seedRand(i) * 0.2;
      const maxH = 0.4 + seedRand(i + barCount) * 0.6;
      const duration = 200 + seedRand(i + barCount * 2) * 400;
      const delay = seedRand(i + barCount * 3) * 300;
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: maxH, duration, useNativeDriver: false }),
          Animated.timing(anim, { toValue: minH, duration, useNativeDriver: false }),
        ])
      );
    });
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, seed]);

  return (
    <View style={[styles.container, { height }]}>
      {animations.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: barColor,
              height: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [2, height],
              }),
              opacity: active ? 1 : 0.5,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
