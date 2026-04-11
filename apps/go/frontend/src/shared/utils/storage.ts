const STORAGE_KEYS = {
  AUTH_TOKEN: "authToken",
};

export class AppStorage {
  static setItem(key: keyof typeof STORAGE_KEYS, value: any) {
    try {
      localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
    } catch (error) {
      console.error(`Error setting item ${key} in localStorage`, error);
    }
  }

  static getItem(key: keyof typeof STORAGE_KEYS) {
    try {
      const value = localStorage.getItem(STORAGE_KEYS[key]);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Error getting item ${key} from localStorage`, error);
      return null;
    }
  }

  static removeItem(key: keyof typeof STORAGE_KEYS) {
    try {
      localStorage.removeItem(STORAGE_KEYS[key]);
    } catch (error) {
      console.error(`Error removing item ${key} from localStorage`, error);
    }
  }

  static clear() {
    try {
      localStorage.clear();
    } catch (error) {
      console.error("Error clearing localStorage", error);
    }
  }
}
