import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/colors';

interface Props {
  tabs: string[];
  activeTab: string;
  onChange: (tab: string) => void;
}

export default function ProfileTabs({
  tabs,
  activeTab,
  onChange,
}: Props) {
  return (
    <View style={styles.wrap}>
      {tabs.map((tab) => {
        const active = tab === activeTab;

        return (
          <Pressable
            key={tab}
            onPress={() => onChange(tab)}
            style={[
              styles.tab,
              active && styles.activeTab,
            ]}
          >
            <Text
              style={[
                styles.text,
                active && styles.activeText,
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 8,
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: 10,
  },
  activeTab: {
    backgroundColor: 'rgba(85,245,178,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(85,245,178,0.18)',
  },
  text: {
    color: Colors.muted,
    fontWeight: '800',
    fontSize: 12,
  },
  activeText: {
    color: Colors.mint,
  },
});
