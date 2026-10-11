export type TradingNotification = {
  title: string;
  body: string;
  tag?: string;
};

export function notificationsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window
  );
}

export function notificationPermission(): NotificationPermission {
  if (!notificationsSupported()) {
    return "denied";
  }

  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) {
    return "denied";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  if (Notification.permission === "denied") {
    return "denied";
  }

  return Notification.requestPermission();
}

export function sendTradingNotification(
  notification: TradingNotification,
): boolean {
  if (!notificationsSupported()) {
    return false;
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  new Notification(notification.title, {
    body: notification.body,
    tag: notification.tag,
  });

  return true;
}
