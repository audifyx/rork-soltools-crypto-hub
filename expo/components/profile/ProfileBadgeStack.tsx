import React from 'react';
import { View, StyleSheet } from 'react-native';

import GlowingBadge from '@/components/social/GlowingBadge';

export default function ProfileBadgeStack({ badges = [] }: any) {
  return (
    <View style={styles.row}>
      {badges.map((badge: any) => (
        <GlowingBadge
          key={badge.id}
          badge={badge}
          compact
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
