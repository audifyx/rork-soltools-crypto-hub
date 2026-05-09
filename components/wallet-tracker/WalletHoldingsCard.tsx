import { router } from 'expo-router';
import { ArrowUpRight, Wallet } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createTokenDetailsRoute, createWalletDetailsRoute } from '@/lib/wallet-tracker/navigation';

export type WalletHolding = {
  wallet: string;
  mint: string;
  symbol: string;
  valueUsd?: number;
  pnlPercent?: number;
};

export default function WalletHoldingsCard({
  holding,
}: {
  holding: WalletHolding;
}) {
  const positive = (holding.pnlPercent || 0) >= 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.symbol}>{holding.symbol}</Text>
          <Text style={styles.wallet} numberOfLines={1}>
            {holding.wallet}
          </Text>
        </View>

        <View style={styles.pnlWrap}>
          <Text
            style={[
              styles.pnl,
              { color: positive ? '#4CFF9D' : '#FF5C7A' },
            ]}
          >
            {positive ? '+' : ''}
            {holding.pnlPercent || 0}%
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() =>
            router.push(createWalletDetailsRoute(holding.wallet) as never)
          }
          style={styles.actionButton}
        >
          <Wallet size={16} color="#7FDBFF" />
          <Text style={styles.actionText}>View Wallet</Text>
        </Pressable>

        <Pressable
          onPress={() =>
            router.push(createTokenDetailsRoute(holding.mint) as never)
          }
          style={styles.actionButton}
        >
          <ArrowUpRight size={16} color="#7FDBFF" />
          <Text style={styles.actionText}>Open Chart</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  symbol: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  wallet: {
    color: '#A6B1C2',
    marginTop: 4,
    maxWidth: 220,
  },
  pnlWrap: {
    alignItems: 'flex-end',
  },
  pnl: {
    fontWeight: '900',
    fontSize: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(127,219,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(127,219,255,0.22)',
  },
  actionText: {
    color: '#7FDBFF',
    fontWeight: '800',
  },
});
