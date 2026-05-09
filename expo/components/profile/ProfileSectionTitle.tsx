import React from 'react';
import { Text, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';

interface Props {
  title: string;
}

export default function ProfileSectionTitle({ title }: Props) {
  return <Text style={styles.title}>{title}</Text>;
}

const styles = StyleSheet.create({
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginBottom: 12,
  },
});
