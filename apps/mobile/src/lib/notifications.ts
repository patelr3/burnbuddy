import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiPut } from './api';

/**
 * Show foreground notifications as banners so the user sees them while using the app.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests push notification permission and returns the Expo push token.
 * Returns null if permissions are denied or the platform is web.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch {
    return null;
  }
}

/**
 * Saves the push token to the user's profile via the API.
 */
export async function savePushToken(token: string): Promise<void> {
  await apiPut('/users/me', { fcmToken: token });
}
