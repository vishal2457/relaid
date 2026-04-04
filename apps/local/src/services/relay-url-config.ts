import { getSecret, setSecret } from "./secrets-manager";
import { logger } from "../shared/logger";
import { intro, isCancel, outro, text, spinner } from "@clack/prompts";


const RELAY_URL_SECRET_KEY = "relay_server_url";

export async function pingRelayHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as Record<string, unknown>;
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function getStoredRelayUrl(): Promise<string | null> {
  return getSecret(RELAY_URL_SECRET_KEY);
}

export async function storeRelayUrl(url: string): Promise<void> {
  await setSecret(RELAY_URL_SECRET_KEY, url);
}

export async function promptAndVerifyRelayUrl(): Promise<string> {

  const storedUrl = await getStoredRelayUrl();

  if (storedUrl) {
    const isHealthy = await pingRelayHealth(storedUrl);
    if (isHealthy) {
      logger.info("Relay server URL verified", { url: storedUrl });
      return storedUrl;
    }

    logger.warn("Stored relay server URL is unreachable", { url: storedUrl });
  }

  intro("Relay Server Configuration");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = await promptForRelayUrl();

    const s = spinner();
    s.start("Verifying relay server connection...");

    const isHealthy = await pingRelayHealth(url);

    if (!isHealthy) {
      s.stop(`✗ Could not reach the relay server at ${url}`);
      console.log("\nPlease check the URL and try again.\n");
      // loop back to re-prompt
      continue;
    }

    s.stop("✓ Relay server connected successfully");

    await storeRelayUrl(url);
    logger.info("Relay server URL stored and verified", { url });

    outro("Relay server URL accepted");

    return url;
  }
}

async function promptForRelayUrl(): Promise<string> {

  const result = await text({
    message: "Enter relay server URL",
    placeholder: "e.g. http://localhost:3001",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "URL is required";
      }
      try {
        new URL(value);
      } catch {
        return "Please enter a valid URL (e.g., http://localhost:3001)";
      }
    },
  });

  if (isCancel(result)) {
    console.log("\nSetup cancelled.");
    process.exit(0);
  }

  return (result as string).trim();
}
