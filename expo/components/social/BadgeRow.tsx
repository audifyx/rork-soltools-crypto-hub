import React from 'react';
import { View, StyleSheet } from 'react-native';

import GlowingBadge from '@/components/social/GlowingBadge';
import type { UserBadge } from '@/lib/badge-system';

interface Props {
  badges: UserBadge[];
}

export default function BadgeRow({ badges }: Props) {
  return (
    <View style={styles.row}>
      {badges.map((badge) => (
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
