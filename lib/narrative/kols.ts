export type KOLCategory =
  | 'meme'
  | 'solana'
  | 'macro'
  | 'security'
  | 'ai'
  | 'news';

export type NarrativeKOL = {
  id: string;
  username: string;
  category: KOLCategory;
  influence: number;
};

export const TRACKED_KOLS: NarrativeKOL[] = [
  {
    id: 'elonmusk',
    username: 'elonmusk',
    category: 'macro',
    influence: 100,
  },
  {
    id: 'realdonaldtrump',
    username: 'realDonaldTrump',
    category: 'macro',
    influence: 98,
  },
  {
    id: 'ansem',
    username: 'blknoiz06',
    category: 'meme',
    influence: 95,
  },
  {
    id: 'zachxbt',
    username: 'zachxbt',
    category: 'security',
    influence: 96,
  },
  {
    id: 'watcherguru',
    username: 'WatcherGuru',
    category: 'news',
    influence: 92,
  },
  {
    id: 'tier10k',
    username: 'tier10k',
    category: 'news',
    influence: 90,
  },
  {
    id: 'whale-alert',
    username: 'whale_alert',
    category: 'markets',
    influence: 88,
  },
  {
    id: 'solanafloor',
    username: 'SolanaFloor',
    category: 'solana',
    influence: 85,
  },
  {
    id: 'toly',
    username: 'aeyakovenko',
    category: 'solana',
    influence: 95,
  },
  {
    id: 'gcr',
    username: 'GCRClassic',
    category: 'macro',
    influence: 93,
  },
];
