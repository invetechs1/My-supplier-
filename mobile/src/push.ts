/** Register this device for Expo push notifications and store the token on the API. */
import { Platform } from 'react-native';
import { api } from './api';

export async function registerForPush(): Promise<string | null> {
  try {
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');
    if (!Device.isDevice) return null;
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'default', importance: Notifications.AndroidImportance.MAX });
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await api.post('/notifications/devices', { token, platform: 'expo', device_name: `${Device.brand || ''} ${Device.modelName || ''}`.trim() });
    return token;
  } catch {
    return null;
  }
}
