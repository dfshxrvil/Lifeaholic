export function scheduledAlertDate(date: string, time: string): Date | null {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const timeParts = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!dateParts || !timeParts) return null;
  const value = new Date(
    Number(dateParts[1]),
    Number(dateParts[2]) - 1,
    Number(dateParts[3]),
    Number(timeParts[1]),
    Number(timeParts[2]),
    0,
    0,
  );
  return value.getFullYear() === Number(dateParts[1])
    && value.getMonth() === Number(dateParts[2]) - 1
    && value.getDate() === Number(dateParts[3])
    ? value
    : null;
}

export function scheduledAlertTimestamp(alert: { date: string; time: string }) {
  return scheduledAlertDate(alert.date, alert.time)?.getTime() ?? Number.NaN;
}
