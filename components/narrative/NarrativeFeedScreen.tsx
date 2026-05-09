import { LinearGradient } from 'expo-linear-gradient';
import { Flame, Globe, Newspaper, Shield, Sparkles, TrendingUp } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const CATEGORIES = [
  { id: 'all', label: 'All', icon: Globe },
  { id: 'crypto', label: 'Crypto', icon: TrendingUp },
  { id: 'memes', label: 'Memes', icon: Flame },
  { id: 'macro', label: 'Macro', icon: Newspaper },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'security', label: 'Security', icon: Shield },
];

const STORIES = [
  {
    id: '1',
    category: 'memes',
    title: 'PEPE narrative exploding after Elon meme repost',
    source: 'Narrative Engine',
    momentum: '+740%',
  },
  {
    id: '2',
    category: 'macro',
    title: 'Trump crypto headlines driving meme coin volume spikes',
    source: 'Macro Feed',
    momentum: '+410%',
  },
  {
    id: '3',
    category: 'crypto',
    title: 'Solana ecosystem mentions surge across tracked KOLs',
    source: 'SolTools AI',
    momentum: '+250%',
  },
  {
    id: '4',
    category: 'ai',
    title: 'AI agents narrative becoming dominant market trend',
    source: 'AI Feed',
    momentum: '+320%',
  },
];

export default function NarrativeFeedScreen() {
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredStories = useMemo(() => {
    if (activeCategory === 'all') {
      return STORIES;
    }

    return STORIES.filter((story) => story.category === activeCategory);
  }, [activeCategory]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#020406', '#07111A', '#04060A']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <LinearGradient
              colors={['rgba(90,180,255,0.18)', 'rgba(255,255,255,0.03)']}
              style={styles.heroGradient}
            >
              <Text style={styles.heroBadge}>NARRATIVE INTELLIGENCE</Text>
              <Text style={styles.heroTitle}>The Market Story Before The Charts</Text>
              <Text style={styles.heroText}>
                Thousands of feeds, KOLs, meme trends, macro events, politics, AI, and on-chain signals merged into one live intelligence feed.
              </Text>

              <View style={styles.heroStatsRow}>
                <View style={styles.heroStatCard}>
                  <Text style={styles.heroStatValue}>2.4K+</Text>
                  <Text style={styles.heroStatLabel}>RSS FEEDS</Text>
                </View>

                <View style={styles.heroStatCard}>
                  <Text style={styles.heroStatValue}>900+</Text>
                  <Text style={styles.heroStatLabel}>KOLS</Text>
                </View>

                <View style={styles.heroStatCard}>
                  <Text style={styles.heroStatValue}>LIVE</Text>
                  <Text style={styles.heroStatLabel}>NARRATIVES</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
          >
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              const active = activeCategory === category.id;

              return (
                <Pressable
                  key={category.id}
                  onPress={() => setActiveCategory(category.id)}
                  style={[
                    styles.categoryPill,
                    active && styles.categoryPillActive,
                  ]}
                >
                  <Icon
                    size={16}
                    color={active ? '#7FDBFF' : '#A6B1C2'}
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      active && styles.categoryTextActive,
                    ]}
                  >
                    {category.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Trending Narratives</Text>
            <Text style={styles.sectionCount}>{filteredStories.length}</Text>
          </View>

          {filteredStories.map((story) => (
            <Pressable key={story.id} style={styles.storyCard}>
              <View style={styles.storyHeader}>
                <Text style={styles.storyCategory}>{story.category.toUpperCase()}</Text>
                <Text style={styles.storyMomentum}>{story.momentum}</Text>
              </View>

              <Text style={styles.storyTitle}>{story.title}</Text>

              <View style={styles.storyFooter}>
                <Text style={styles.storySource}>{story.source}</Text>
                <Text style={styles.storyLive}>LIVE</Text>
              </View>
            </Pressable>
          ))}

          <View style={styles.librarySection}>
            <Text style={styles.libraryTitle}>Narrative Library</Text>

            <View style={styles.libraryGrid}>
              <View style={styles.libraryCard}>
                <Text style={styles.libraryCardValue}>2.4K+</Text>
                <Text style={styles.libraryCardLabel}>News Feeds</Text>
              </View>

              <View style={styles.libraryCard}>
                <Text style={styles.libraryCardValue}>900+</Text>
                <Text style={styles.libraryCardLabel}>Tracked KOLs</Text>
              </View>

              <View style={styles.libraryCard}>
                <Text style={styles.libraryCardValue}>24/7</Text>
                <Text style={styles.libraryCardLabel}>Realtime Tracking</Text>
              </View>

              <View style={styles.libraryCard}>
                <Text style={styles.libraryCardValue}>AI</Text>
                <Text style={styles.libraryCardLabel}>Narrative Detection</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#020406',
  },
  safe: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 120,
  },
  heroCard: {
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 22,
  },
  heroGradient: {
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroBadge: {
    color: '#7FDBFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
    marginBottom: 12,
  },
  heroText: {
    color: '#A6B1C2',
    fontSize: 14,
    lineHeight: 22,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  heroStatCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroStatValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  heroStatLabel: {
    color: '#A6B1C2',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 1,
  },
  categoryRow: {
    gap: 10,
    paddingBottom: 6,
    marginBottom: 24,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  categoryPillActive: {
    backgroundColor: 'rgba(127,219,255,0.12)',
    borderColor: 'rgba(127,219,255,0.28)',
  },
  categoryText: {
    color: '#A6B1C2',
    fontWeight: '800',
  },
  categoryTextActive: {
    color: '#7FDBFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  sectionCount: {
    color: '#7FDBFF',
    fontSize: 14,
    fontWeight: '800',
  },
  storyCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  storyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  storyCategory: {
    color: '#7FDBFF',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  storyMomentum: {
    color: '#4CFF9D',
    fontWeight: '900',
    fontSize: 12,
  },
  storyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 26,
  },
  storyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  storySource: {
    color: '#A6B1C2',
    fontWeight: '700',
  },
  storyLive: {
    color: '#4CFF9D',
    fontWeight: '900',
    letterSpacing: 1,
  },
  librarySection: {
    marginTop: 28,
  },
  libraryTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 18,
  },
  libraryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  libraryCard: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 24,
    paddingVertical: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  libraryCardValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  libraryCardLabel: {
    color: '#A6B1C2',
    marginTop: 8,
    fontWeight: '700',
  },
});
