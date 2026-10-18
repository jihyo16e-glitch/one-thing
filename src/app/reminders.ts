// Reminders that ring when the app is closed (APK only). Android's alarm system through
// @capacitor/local-notifications: no server, works offline, survives a phone restart.
// The web app cannot do this (Chrome ended Notification Triggers), so it hands the reminder to
// Google Calendar instead (TalkScreen).
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './native';

export type ReminderResult = 'ok' | 'inexact' | 'denied' | 'error';

/** true when this phone can ring a reminder itself (the APK). */
export function canRing(): boolean {
  return isNative();
}

let channelReady = false;

/** A whole number Android can use as the notification id. */
function newId(): number {
  return Math.floor(Date.now() / 1000) % 2147483647;
}

/**
 * Schedules one reminder. 'inexact' = scheduled, but Android may deliver it late because
 * "Alarms and reminders" is off for the app; openExactSettings() lets the user turn it on.
 */
export async function scheduleReminder(text: string, at: Date): Promise<ReminderResult> {
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return 'denied';
    if (!channelReady) {
      await LocalNotifications.createChannel({
        id: 'reminders',
        name: 'Reminders',
        description: 'Reminders you set by voice or typing',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
      channelReady = true;
    }
    await LocalNotifications.schedule({
      notifications: [{ id: newId(), title: text, body: 'Reminder from One Thing', channelId: 'reminders', schedule: { at, allowWhileIdle: true } }],
    });
    try {
      const exact = await LocalNotifications.checkExactNotificationSetting();
      return exact.exact_alarm === 'granted' ? 'ok' : 'inexact';
    } catch {
      return 'ok'; // Android 11 and older: every alarm is exact
    }
  } catch {
    return 'error';
  }
}

/** Opens the phone's "Alarms and reminders" setting for One Thing. */
export function openExactSettings(): void {
  LocalNotifications.changeExactNotificationSetting().catch(() => undefined);
}
