import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';
import GlassCard from '@/components/ui/GlassCard';

export default function TokenGateBanner() {
  return (
    <GlassCard
      style={styles.banner}
      radius={24}
      padding={18}
      borderColor="rgba(63,169,255,0.28)"
      gradient={["rgba(63,169,255,0.18)", "rgba(98,208,255,0.04)"]}
      glowColor={Colors.mint}
    >
      <View style={styles.row}>
        <View style={styles.dot} />
        <Text style={styles.title}>TOKEN GATED</Text>
      </View>
      <Text style={styles.subtitle}>
        Verified wallet required for community access.
      </Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  banner: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.mint },
  title: {
    color: Colors.mint,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1.4,
  },
  subtitle: {
    marginTop: 8,
    color: Colors.text,
    lineHeight: 20,
    fontWeight: '600',
  },
});
