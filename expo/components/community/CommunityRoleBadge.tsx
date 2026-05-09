import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';

interface Props {
  role: string;
}

export default function CommunityRoleBadge({ role }: Props) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{role.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(139,92,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,255,0.2)',
  },
  text: {
    color: Colors.text,
    fontWeight: '900',
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
