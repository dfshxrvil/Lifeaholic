import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isWebServer = Platform.OS === 'web' && typeof window === 'undefined';

export const secureStorage = {
  getItem: (key: string) => {
    if (isWebServer) return Promise.resolve(null);
    return Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string) => {
    if (isWebServer) return;
    if (Platform.OS === 'web') await AsyncStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string) => {
    if (isWebServer) return;
    if (Platform.OS === 'web') await AsyncStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};
