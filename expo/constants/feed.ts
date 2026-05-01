export type TrendingPair = {
  id: string;
  ticker: string;
  name: string;
  mc: string;
  liq: string;
  changePct: number;
  ageMin: number;
  holders: number;
  avatarColor: string;
  hot?: boolean;
};

export const TRENDING_PAIRS: TrendingPair[] = [];

export type FeedPost = {
  id: string;
  handle: string;
  name: string;
  avatarColor: string;
  verified?: boolean;
  time: string;
  text: string;
  pair?: { ticker: string; changePct: number };
  likes: number;
  reposts: number;
  comments: number;
  views: string;
};

export const FEED_POSTS: FeedPost[] = [];

export const TRENDING_TOPICS: { id: string; tag: string; count: string; tone: string }[] = [];
