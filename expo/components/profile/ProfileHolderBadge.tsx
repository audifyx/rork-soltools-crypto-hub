import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';

interface Props {
  tier: string;
}

export default function ProfileHolderBadge({ tier }: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{tier} HOLDER</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(85,245,178,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(85,245,178,0.2)',
  },
  text: {
    color: Colors.mint,
    fontWeight: '900',
    fontSize: 11,
  },
});
