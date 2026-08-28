export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function getDateStrip(center = new Date(), before = 3, after = 10) {
  return Array.from({ length: before + after + 1 }, (_, index) => addDays(center, index - before));
}

export function formatEventTime(start: Date, end: Date, allDay = false) {
  if (allDay) return 'All day';
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const duration = minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
  return `${time.format(start)} · ${duration}`;
}
