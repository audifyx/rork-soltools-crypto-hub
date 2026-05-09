import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';

interface Props {
  wallet: string;
  holding?: string;
}

export default function ProfileWalletCard({ wallet, holding }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>CONNECTED WALLET</Text>

      <Text style={styles.wallet} numberOfLines={1}>
        {wallet}
      </Text>

      {!!holding && (
        <Text style={styles.holding}>{holding}</Text>
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
    borderColor: 'rgba(85,245,178,0.12)',
  },
  label: {
    color: Colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  wallet: {
    marginTop: 10,
    color: Colors.text,
    fontWeight: '800',
  },
  holding: {
    marginTop: 8,
    color: Colors.mint,
    fontWeight: '900',
  },
});
