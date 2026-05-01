import { Tabs } from "expo-router";
import { Compass, Home, Rocket, User, Wrench } from "lucide-react-native";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import Colors from "@/constants/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.mint,
        tabBarInactiveTintColor: Colors.muted,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
        tabBarBackground: () => <View style={styles.barBg} />,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} strokeWidth={2.4} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          tabBarIcon: ({ color, size }) => <Compass color={color} size={size} strokeWidth={2.4} />,
        }}
      />
      <Tabs.Screen
        name="launches"
        options={{
          title: "Launches",
          tabBarIcon: ({ color, size }) => <Rocket color={color} size={size} strokeWidth={2.4} />,
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: "Tools",
          tabBarIcon: ({ color, size }) => <Wrench color={color} size={size} strokeWidth={2.4} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <User color={color} size={size} strokeWidth={2.4} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    borderTopWidth: 1,
    borderTopColor: "rgba(85, 245, 178, 0.12)",
    backgroundColor: "transparent",
    elevation: 0,
    height: Platform.OS === "ios" ? 86 : 68,
    paddingTop: 8,
  },
  barBg: {
    flex: 1,
    backgroundColor: "rgba(3, 7, 8, 0.94)",
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 2,
  },
});
