export type CommunityVisibility = 'public' | 'private' | 'holders';

export interface CommunityRoleConfig {
  admins: string[];
  mods: string[];
  supporters: string[];
}

export interface HolderCommunityConfig {
  enabled: boolean;
  minimumBalance: number;
  tokenSymbol: string;
}
