import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';

interface Props {
  symbol: string;
  marketCap?: string;
}

export default function ProfileTokenCard({
  symbol,
  marketCap,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>PINNED TOKEN</Text>

      <Text style={styles.symbol}>${symbol}</Text>

      {!!marketCap && (
        <Text style={styles.marketCap}>{marketCap}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  label: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  symbol: {
    marginTop: 10,
    color: Colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  marketCap: {
    marginTop: 6,
    color: Colors.mint,
    fontWeight: '800',
  },
});
