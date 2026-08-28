export interface FocusSession {
  id: string;
  subjectId: string;
  subjectName: string;
  colorHex: string;
  durationInMinutes: number;
  /** Local calendar date in YYYY-MM-DD format. */
  date: string;
}

export interface MonthlySummary {
  monthKey: string;
  label: string;
  totalMinutes: number;
  sessionCount: number;
  activeDays: number;
}

export type FocusAnalyticsTimeRange = 'currentMonth' | 'lastMonth' | 'last6Months';

export interface SubjectOption {
  id: string;
  name: string;
  colorHex: string;
}

export interface FocusAnalyticsDashboardProps {
  sessions?: FocusSession[];
  referenceDate?: Date;
  darkMode?: boolean;
  className?: string;
}
