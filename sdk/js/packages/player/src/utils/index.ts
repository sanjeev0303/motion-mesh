export function isProbablyJwt(token: string) {
  if (!token) return false;

  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

export function verifyApiKeySignature(plainKey: string) {
  if (!plainKey) return false;
  if (plainKey.startsWith("mot_live_") || plainKey.startsWith("mot_test_")) return true;
  return false;
}


let cachedCountry: string | null = null
const STORAGE_KEY = "vmx:user-country";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StoredCountry = {
    value: string;
    expiresAt: number;
}


export async function getUserCountry(): Promise<string | null> {
  // 1. In-memory cache
  if (cachedCountry) return cachedCountry;

  // 2. localStorage cache (browser only)
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (raw) {
        const parsed: StoredCountry = JSON.parse(raw);

        if (parsed.expiresAt > Date.now()) {
          cachedCountry = parsed.value;
          return cachedCountry;
        } else {
          // expired
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // corrupted storage, ignore
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // 3. Fallback to ipapi
  try {
    const response = await fetch("https://ipapi.co/country/");

    if (!response.ok) {
      throw new Error("Failed to fetch country");
    }

    const countryCode = (await response.text()).trim();
    cachedCountry = countryCode;

    // store in localStorage
    if (typeof window !== "undefined") {
      const payload: StoredCountry = {
        value: countryCode,
        expiresAt: Date.now() + TTL_MS,
      };

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(payload)
      );
    }

    return cachedCountry;
  } catch (error) {
    console.error("Error fetching user country:", error);
    return null;
  }
}
