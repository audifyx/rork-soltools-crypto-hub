import React from 'react';
import { View, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';

export default function ProfileVerifiedDot() {
  return <View style={styles.dot} />;
}

const styles = StyleSheet.create({
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: Colors.mint,
  },
});
