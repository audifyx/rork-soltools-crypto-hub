import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';

interface Props {
  label: string;
}

export default function CommunityAccessBadge({ label }: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(85,245,178,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(85,245,178,0.2)',
    alignSelf: 'flex-start',
  },
  text: {
    color: Colors.mint,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 0.6,
  },
});
