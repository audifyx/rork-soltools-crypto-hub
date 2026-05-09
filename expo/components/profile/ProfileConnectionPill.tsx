import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';

export default function ProfileConnectionPill({ text = 'Connected' }: any) {
  return (
    <View style={styles.pill}>
      <Text style={styles.label}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(85,245,178,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(85,245,178,0.18)',
  },
  label: {
    color: Colors.mint,
    fontWeight: '900',
    fontSize: 11,
  },
});
