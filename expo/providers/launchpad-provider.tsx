import createContextHook from "@nkzw/create-context-hook";

export const [LaunchpadProvider, useLaunchpad] = createContextHook(() => {
  return {
    isLoading: false,
    isRefreshing: false,
    listings: [],
    filtered: [],
    featured: [],
    trending: [],
    stats: {
      listedTokens: 0,
      volume24hUsd: 0,
      totalLiquidityUsd: 0,
      featuredCount: 0,
    },
    tab: "all",
    setTab: () => {},
    sort: "newest",
    setSort: () => {},
    venue: "all",
    setVenue: () => {},
    search: "",
    setSearch: () => {},
    submit: async () => [],
    isSubmitting: false,
    remove: () => {},
    refresh: () => {},
    upvoted: {},
    toggleUpvote: () => {},
    getById: () => null,
  };
});
