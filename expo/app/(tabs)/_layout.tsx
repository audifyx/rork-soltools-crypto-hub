import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Compass, Home, Rocket, User, Wrench } from "lucide-react-native";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import Colors from "@/constants/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.text,
        tabBarInactiveTintColor: Colors.muted,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
        tabBarIconStyle: styles.icon,
        tabBarAllowFontScaling: false,
        tabBarLabelPosition: "below-icon",
        tabBarBackground: () => (
          <View style={styles.barBgWrap} pointerEvents="none">
            {Platform.OS !== "web" ? (
              <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            ) : null}
            <View style={styles.barBg} />
            <LinearGradient
              colors={["rgba(0,255,163,0.22)", "rgba(124,92,255,0.18)", "rgba(34,211,255,0.14)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.barInnerBorder} />
          </View>
        ),
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
        name="streams"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          href: null,
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
    left: 8,
    right: 8,
    bottom: Platform.OS === "ios" ? 22 : 14,
    borderTopWidth: 0,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "transparent",
    elevation: 0,
    height: 72,
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 2,
    borderRadius: 30,
    overflow: "hidden",
    shadowColor: Colors.violet,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
  },
  item: {
    paddingTop: 2,
    paddingHorizontal: 0,
    flex: 1,
  },
  icon: {
    marginBottom: 0,
  },
  barBgWrap: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 30,
  },
  barBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 5, 10, 0.72)",
  },
  barInnerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  label: {
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginTop: 2,
    marginBottom: 0,
    includeFontPadding: false,
    textAlign: "center",
  },
});
