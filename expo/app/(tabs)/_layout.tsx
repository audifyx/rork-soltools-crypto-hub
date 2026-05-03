import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Compass, Home, User, Wrench } from "lucide-react-native";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import Colors from "@/constants/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.goldBright,
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
              colors={["rgba(244,198,91,0.24)", "rgba(221,227,236,0.10)", "rgba(0,0,0,0.04)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.activePlate} />
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
          href: null,
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
    left: 10,
    right: 10,
    bottom: Platform.OS === "ios" ? 22 : 14,
    borderTopWidth: 0,
    borderWidth: 1.5,
    borderColor: "rgba(216,183,90,0.34)",
    backgroundColor: "transparent",
    elevation: 0,
    height: 74,
    paddingTop: 7,
    paddingBottom: 10,
    paddingHorizontal: 4,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: Colors.goldBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
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
    borderRadius: 24,
  },
  barBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,3,1,0.88)",
  },
  activePlate: {
    position: "absolute",
    top: 8,
    bottom: 8,
    left: 8,
    right: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(244,198,91,0.16)",
  },
  barInnerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(221,227,236,0.14)",
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
