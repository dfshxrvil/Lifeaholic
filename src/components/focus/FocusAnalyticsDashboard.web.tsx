import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  filterByRange,
  formatDuration,
  getDailyStudyData,
  getMonthOverMonth,
  getMonthlyHistory,
  getSubjects,
  getSubjectSplit,
  shiftMonth,
  type DailyStudyPoint,
} from './analytics/analytics';
import type { FocusAnalyticsDashboardProps, FocusAnalyticsTimeRange } from './analytics/types';

const CARD_CLASS = 'rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950';
const SELECT_CLASS = 'min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

type KpiCardProps = {
  label: string;
  value: string;
  detail: string;
  badge?: { value: string; positive: boolean };
};

function KpiCard({ label, value, detail, badge }: KpiCardProps) {
  return (
    <article className={`${CARD_CLASS} min-w-0 p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        {badge ? (
          <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${badge.positive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'}`}>
            {badge.value}
          </span>
        ) : null}
      </div>
      <p className="mb-1 mt-4 truncate text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{value}</p>
      <p className="m-0 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </article>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/75 px-6 text-center text-sm text-slate-500 backdrop-blur-[1px] dark:bg-slate-950/75 dark:text-slate-400">
      {message}
    </div>
  );
}

function ChartCard({ title, subtitle, className = '', children }: { title: string; subtitle: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`${CARD_CLASS} min-w-0 p-4 sm:p-5 ${className}`}>
      <header className="mb-5">
        <h2 className="m-0 text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
        <p className="mb-0 mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function DailyTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload: DailyStudyPoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="max-w-56 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="m-0 font-semibold text-slate-900 dark:text-white">Day {point.day} · {point.minutes} minutes</p>
      {point.sessions.length ? (
        <ul className="mb-0 mt-2 space-y-1 p-0">
          {point.sessions.map((session) => (
            <li className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-300" key={session.id}>
              <span className="flex min-w-0 items-center gap-1.5 truncate">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: session.colorHex }} />
                <span className="truncate">{session.subjectName}</span>
              </span>
              <span className="font-medium">{session.durationInMinutes}m</span>
            </li>
          ))}
        </ul>
      ) : <p className="mb-0 mt-1 text-slate-500">No sessions</p>}
    </div>
  );
}

function SubjectLegend({ data }: { data: ReturnType<typeof getSubjectSplit> }) {
  if (!data.length) return <p className="m-0 text-center text-sm text-slate-500 dark:text-slate-400">No subject activity in this period.</p>;
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-1">
      {data.map((subject) => (
        <li className="flex items-center gap-2 text-xs" key={subject.id}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: subject.colorHex }} />
          <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{subject.name}</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{subject.percentage}%</span>
        </li>
      ))}
    </ul>
  );
}

function DashboardFilters({
  range,
  subjectId,
  subjects,
  onRangeChange,
  onSubjectChange,
}: {
  range: FocusAnalyticsTimeRange;
  subjectId: string;
  subjects: ReturnType<typeof getSubjects>;
  onRangeChange: (value: FocusAnalyticsTimeRange) => void;
  onSubjectChange: (value: string) => void;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Time period
        <select className={SELECT_CLASS} value={range} onChange={(event) => onRangeChange(event.target.value as FocusAnalyticsTimeRange)}>
          <option value="currentMonth">Current Month</option>
          <option value="lastMonth">Last Month</option>
          <option value="last6Months">Last 6 Months</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
        Subject
        <select className={SELECT_CLASS} value={subjectId} onChange={(event) => onSubjectChange(event.target.value)}>
          <option value="all">All Subjects</option>
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
      </label>
    </div>
  );
}

export default function FocusAnalyticsDashboard({ sessions, referenceDate, darkMode = false, className = '' }: FocusAnalyticsDashboardProps) {
  const anchorDate = useMemo(() => referenceDate ?? new Date(), [referenceDate]);
  const sourceSessions = useMemo(() => sessions ?? [], [sessions]);
  const [range, setRange] = useState<FocusAnalyticsTimeRange>('currentMonth');
  const [subjectId, setSubjectId] = useState('all');

  const subjects = useMemo(() => getSubjects(sourceSessions), [sourceSessions]);
  const rangeSessions = useMemo(() => filterByRange(sourceSessions, anchorDate, range), [sourceSessions, anchorDate, range]);
  const filteredSessions = useMemo(
    () => subjectId === 'all' ? rangeSessions : rangeSessions.filter((session) => session.subjectId === subjectId),
    [rangeSessions, subjectId],
  );
  const subjectFilteredAllTime = useMemo(
    () => subjectId === 'all' ? sourceSessions : sourceSessions.filter((session) => session.subjectId === subjectId),
    [sourceSessions, subjectId],
  );

  const totalMinutes = filteredSessions.reduce((sum, session) => sum + session.durationInMinutes, 0);
  const activeDays = new Set(filteredSessions.map((session) => session.date)).size;
  const dailyAverage = activeDays ? Math.round(totalMinutes / activeDays) : 0;
  const subjectSplit = useMemo(() => getSubjectSplit(filteredSessions), [filteredSessions]);
  const mostStudied = subjectSplit[0];
  const dailyData = useMemo(() => getDailyStudyData(filteredSessions, anchorDate, range), [filteredSessions, anchorDate, range]);
  const monthlyHistory = useMemo(() => getMonthlyHistory(subjectFilteredAllTime, anchorDate), [subjectFilteredAllTime, anchorDate]);
  const comparisonMonth = useMemo(() => range === 'lastMonth' ? shiftMonth(anchorDate, -1) : anchorDate, [anchorDate, range]);
  const monthOverMonth = useMemo(() => getMonthOverMonth(sourceSessions, comparisonMonth, subjectId), [sourceSessions, comparisonMonth, subjectId]);
  const axisColor = darkMode ? '#64748B' : '#94A3B8';
  const gridColor = darkMode ? '#1E293B' : '#E2E8F0';
  const hasActivity = totalMinutes > 0;

  return (
    <div className={darkMode ? 'dark' : ''}>
      <main className={`min-h-screen bg-slate-50 px-4 py-6 text-slate-950 dark:bg-slate-900 dark:text-white sm:px-6 lg:px-8 ${className}`}>
        <div className="mx-auto max-w-7xl">
          <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Focus insights</p>
              <h1 className="mb-0 mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Focus Analytics</h1>
              <p className="mb-0 mt-2 text-sm text-slate-500 dark:text-slate-400">Understand your study rhythm and make every session count.</p>
            </div>
            <DashboardFilters range={range} subjectId={subjectId} subjects={subjects} onRangeChange={setRange} onSubjectChange={setSubjectId} />
          </header>

          <section aria-label="Focus summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total focus time" value={formatDuration(totalMinutes)} detail={`${filteredSessions.length} sessions in selected period`} />
            <KpiCard label="Daily average" value={formatDuration(dailyAverage)} detail={activeDays ? `Across ${activeDays} active ${activeDays === 1 ? 'day' : 'days'}` : 'No active days yet'} />
            <KpiCard label="Most studied" value={mostStudied?.name ?? 'No activity'} detail={mostStudied ? `${formatDuration(mostStudied.minutes)} · ${mostStudied.percentage}% of focus time` : 'Complete a session to see a leader'} />
            <KpiCard
              label="Month over month"
              value={`${monthOverMonth > 0 ? '+' : ''}${monthOverMonth}%`}
              detail="Compared with the preceding month"
              badge={{ value: `${monthOverMonth >= 0 ? '↗' : '↘'} ${Math.abs(monthOverMonth)}%`, positive: monthOverMonth >= 0 }}
            />
          </section>

          <section aria-label="Focus charts" className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
            <ChartCard className="xl:col-span-8" title="Daily study" subtitle={range === 'last6Months' ? 'Focus hours grouped by day of month' : 'Focus hours by calendar day'}>
              <div className="relative h-72 w-full">
                {!hasActivity && <EmptyChart message="No focus sessions match these filters." />}
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                    <XAxis axisLine={false} dataKey="label" interval={range === 'last6Months' ? 2 : 'preserveStartEnd'} tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} />
                    <YAxis axisLine={false} tick={{ fill: axisColor, fontSize: 11 }} tickFormatter={(value: number) => `${value}h`} tickLine={false} />
                    <Tooltip cursor={{ fill: darkMode ? '#1E293B' : '#F1F5F9' }} content={(props) => <DailyTooltip active={props.active} payload={props.payload as unknown as readonly { payload: DailyStudyPoint }[] | undefined} />} />
                    <Bar dataKey="hours" fill="#6366F1" maxBarSize={26} radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard className="xl:col-span-4" title="Subject split" subtitle="Share of total focused time">
              <div className="grid min-h-72 grid-cols-1 items-center gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="relative mx-auto h-48 w-full max-w-64">
                  {!hasActivity && <EmptyChart message="No subject data yet." />}
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={subjectSplit} dataKey="minutes" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">
                        {subjectSplit.map((entry) => <Cell fill={entry.colorHex} key={entry.id} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: darkMode ? '#0F172A' : '#FFFFFF', borderColor: darkMode ? '#334155' : '#E2E8F0', borderRadius: 8, color: darkMode ? '#F8FAFC' : '#0F172A' }} formatter={(value) => [formatDuration(Number(value)), 'Focus time']} />
                    </PieChart>
                  </ResponsiveContainer>
                  {hasActivity && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-lg text-slate-900 dark:text-white">{formatDuration(totalMinutes)}</strong><span className="text-[10px] uppercase tracking-wider text-slate-500">Total</span></div>}
                </div>
                <SubjectLegend data={subjectSplit} />
              </div>
            </ChartCard>

            <ChartCard className="xl:col-span-12" title="Monthly history" subtitle="Total focus hours over the past six months">
              <div className="relative h-64 w-full">
                {monthlyHistory.every((month) => month.totalMinutes === 0) && <EmptyChart message="Monthly history will appear after your first focus session." />}
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyHistory.map((month) => ({ ...month, hours: Number((month.totalMinutes / 60).toFixed(2)) }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                    <XAxis axisLine={false} dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} />
                    <YAxis axisLine={false} tick={{ fill: axisColor, fontSize: 11 }} tickFormatter={(value: number) => `${value}h`} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: darkMode ? '#0F172A' : '#FFFFFF', borderColor: darkMode ? '#334155' : '#E2E8F0', borderRadius: 8, color: darkMode ? '#F8FAFC' : '#0F172A' }} formatter={(value) => [formatDuration(Number(value) * 60), 'Focus time']} labelFormatter={(label) => `${label}`} />
                    <Bar dataKey="hours" fill="#14B8A6" maxBarSize={54} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </section>
        </div>
      </main>
    </div>
  );
}

export type { FocusAnalyticsDashboardProps, FocusSession } from './analytics/types';
