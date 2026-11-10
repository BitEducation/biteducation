/** localStorage wrapped in try/catch: the app keeps working when storage is blocked or full. */

export function readJson<T>(key: string, validate: (v: unknown) => v is T): T | null {
  try {
    const rawValue = localStorage.getItem(key);
    if (rawValue === null) return null;
    const parsed: unknown = JSON.parse(rawValue);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: preference lasts only for this visit */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
