import React from 'react';
import { Text, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';
import GlassCard from '@/components/ui/GlassCard';

interface Props {
  value: string;
  label: string;
}

export default function ProfileStatCard({ value, label }: Props) {
  return (
    <GlassCard
      style={styles.card}
      radius={20}
      padding={14}
      borderColor="rgba(255,255,255,0.10)"
      gradient={["rgba(63,169,255,0.10)", "rgba(255,255,255,0.02)"]}
    >
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
  },
  value: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  label: {
    marginTop: 4,
    color: Colors.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
