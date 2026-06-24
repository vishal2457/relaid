import { createOpencode } from "@opencode-ai/sdk";

async function main() {
  const instance = await createOpencode({ port: 0 });
  console.log("Server URL:", instance.server.url);
  try {
    const response = await instance.client.config.providers();
    console.log("Response keys:", Object.keys(response));
    console.log("Full response:", JSON.stringify(response, (k,v) => typeof v === 'function' ? '[Function]' : v, 2).slice(0, 2000));
  } catch (e) {
    console.error("Error:", e.message, e.stack);
  } finally {
    instance.server.close();
  }
}
main();
