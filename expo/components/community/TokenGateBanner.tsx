import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';

export default function TokenGateBanner() {
  return (
    <View style={styles.banner}>
      <Text style={styles.title}>TOKEN GATED</Text>
      <Text style={styles.subtitle}>
        Verified wallet required for community access.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: 'rgba(85,245,178,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(85,245,178,0.18)',
  },
  title: {
    color: Colors.mint,
    fontWeight: '900',
    fontSize: 18,
  },
  subtitle: {
    marginTop: 8,
    color: Colors.text,
    lineHeight: 20,
    fontWeight: '600',
  },
});
