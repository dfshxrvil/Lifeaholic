export type GoogleCalendarEvent = {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  calendarName?: string;
  htmlLink?: string;
};

export type GoogleApiEvent = {
  id: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
};
