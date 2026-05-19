import AsyncStorage from "@react-native-async-storage/async-storage";

const ONBOARDING_SEEN_KEY = "ONBOARDING_SEEN";
const listeners = new Set<(seen: boolean) => void>();
let currentOnboardingSeen: boolean | null = null;

function notifyOnboardingSeen(seen: boolean) {
  currentOnboardingSeen = seen;
  listeners.forEach((listener) => listener(seen));
}

export async function hasSeenOnboarding(): Promise<boolean> {
  if (currentOnboardingSeen !== null) {
    return currentOnboardingSeen;
  }

  try {
    const seen = (await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)) === "true";
    currentOnboardingSeen = seen;
    return seen;
  } catch {
    currentOnboardingSeen = false;
    return false;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "true");
    notifyOnboardingSeen(true);
  } catch {
    // Ignore storage errors and let startup fall back gracefully.
  }
}

export function subscribeToOnboardingSeen(
  listener: (seen: boolean) => void,
): () => void {
  listeners.add(listener);
  if (currentOnboardingSeen !== null) {
    listener(currentOnboardingSeen);
  }

  return () => {
    listeners.delete(listener);
  };
}
