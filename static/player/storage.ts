export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const getLocalStorage = (): StorageLike | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const safeLocalStorage = {
  getItem(key: string): string | null {
    const storage = getLocalStorage();
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    const storage = getLocalStorage();
    if (!storage) return;
    try {
      storage.setItem(key, value);
    } catch {
      // ignore
    }
  },
  removeItem(key: string): void {
    const storage = getLocalStorage();
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
