export type HolderRisk = {
  top10Percent: number;
  warning: boolean;
  label: string;
};

export function analyzeHolderRisk(top10Percent: number): HolderRisk {
  if (top10Percent >= 50) {
    return {
      top10Percent,
      warning: true,
      label: 'High concentration',
    };
  }

  if (top10Percent >= 25) {
    return {
      top10Percent,
      warning: true,
      label: 'Moderate concentration',
    };
  }

  return {
    top10Percent,
    warning: false,
    label: 'Healthy distribution',
  };
}
