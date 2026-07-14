import { useTheme } from './ThemeProvider';

export type ChartTheme = {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
};

export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  return {
    grid: isDark ? '#27272a' : '#f4f4f5',
    axis: isDark ? '#a1a1aa' : '#71717a',
    tooltipBg: isDark ? '#18181b' : '#ffffff',
    tooltipBorder: isDark ? '#3f3f46' : '#e4e4e7',
    tooltipText: isDark ? '#fafafa' : '#18181b',
  };
}
