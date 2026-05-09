import React from 'react';
import { View, StyleSheet } from 'react-native';

import Colors from '@/constants/colors';

interface Props {
  size?: number;
}

export default function ProfileGlowRing({ size = 110 }: Props) {
  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 3,
    borderColor: Colors.mint,
    shadowColor: Colors.mint,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 0,
    },
    elevation: 8,
  },
});
