export type ScheduledAlertKind = 'reminder' | 'alarm';
export type ReminderDeliveryMode = 'silent' | 'notification' | 'alarm';

export type ScheduledAlert = {
  id: string;
  userId: string;
  kind: ScheduledAlertKind;
  title: string;
  date: string;
  time: string;
  deliveryMode: ReminderDeliveryMode;
  enabled: boolean;
  notificationIdentifier: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledAlertDraft = Pick<
  ScheduledAlert,
  'kind' | 'title' | 'date' | 'time' | 'deliveryMode'
>;
