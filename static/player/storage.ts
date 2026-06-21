export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const getLocalStorage = (): StorageLike | null => {
  try {
    return window.localStorage;
  } catch (error) {
    console.error("failed to access localstorage:", error);
    return null;
  }
};

export const safeLocalStorage = {
  getItem(key: string): string | null {
    const storage = getLocalStorage();
    if (!storage) {
      return null;
    }
    try {
      return storage.getItem(key);
    } catch (error) {
      console.error(`failed to get localstorage item '${key}':`, error);
      return null;
    }
  },
  setItem(key: string, value: string): void {
    const storage = getLocalStorage();
    if (!storage) {
      return;
    }
    try {
      storage.setItem(key, value);
    } catch (error) {
      console.error(`failed to set localstorage item '${key}':`, error);
    }
  },
  removeItem(key: string): void {
    const storage = getLocalStorage();
    if (!storage) {
      return;
    }
    try {
      storage.removeItem(key);
    } catch (error) {
      console.error(`failed to remove localstorage item '${key}':`, error);
    }
  },
};
