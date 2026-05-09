import React from 'react';
import { View, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';

export default function ProfileMintGlow() {
  return <View style={styles.glow} />;
}

const styles = StyleSheet.create({
  glow: {
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: Colors.mint,
    opacity: 0.1,
  },
});
