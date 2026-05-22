/**
 * One-time script to register a webhook with Gemini API
 *
 * Run with: npx ts-node scripts/register-webhook.ts
 *
 * IMPORTANT: Save the signing secret that is returned!
 * It will only be shown once and is needed to verify webhook callbacks.
 */

import "dotenv/config";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;

if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY environment variable is not set");
  process.exit(1);
}

if (!APP_URL) {
  console.error("Error: APP_URL environment variable is not set");
  console.error("Set it to your public domain (e.g., https://your-app.vercel.app)");
  process.exit(1);
}

const WEBHOOK_URL = `${APP_URL}/api/webhooks/gemini`;

async function registerWebhook() {
  console.log("=".repeat(60));
  console.log("Registering Gemini Webhook");
  console.log("=".repeat(60));
  console.log("");
  console.log("Webhook URL:", WEBHOOK_URL);
  console.log("");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/webhooks?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          display_name: "CarMarketplace_BatchProcessor",
          subscribed_events: [
            "batch.succeeded",
            "batch.failed",
            "batch.cancelled",
            "batch.expired",
          ],
          uri: WEBHOOK_URL,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("Failed to register webhook:");
      console.error(JSON.stringify(error, null, 2));
      process.exit(1);
    }

    const webhook = await response.json();

    console.log("=".repeat(60));
    console.log("WEBHOOK REGISTERED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log("");
    console.log("Webhook ID:", webhook.name);
    console.log("Display Name:", webhook.displayName);
    console.log("URI:", webhook.uri);
    console.log("Events:", webhook.subscribedEvents?.join(", "));
    console.log("");
    console.log("=".repeat(60));
    console.log("⚠️  IMPORTANT: SAVE THIS SECRET!");
    console.log("⚠️  IT WILL NOT BE SHOWN AGAIN!");
    console.log("=".repeat(60));
    console.log("");
    console.log("Add this to your .env file:");
    console.log("");
    console.log(`GEMINI_WEBHOOK_SECRET=${webhook.newSigningSecret}`);
    console.log("");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Error registering webhook:", error);
    process.exit(1);
  }
}

async function listWebhooks() {
  console.log("Listing existing webhooks...");
  console.log("");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/webhooks?key=${GEMINI_API_KEY}`
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("Failed to list webhooks:", error);
      return;
    }

    const data = await response.json();

    if (!data.webhooks || data.webhooks.length === 0) {
      console.log("No webhooks registered yet.");
      return;
    }

    console.log(`Found ${data.webhooks.length} webhook(s):`);
    console.log("");

    for (const webhook of data.webhooks) {
      console.log(`- ${webhook.name}`);
      console.log(`  Display Name: ${webhook.displayName}`);
      console.log(`  URI: ${webhook.uri}`);
      console.log(`  Events: ${webhook.subscribedEvents?.join(", ")}`);
      console.log("");
    }
  } catch (error) {
    console.error("Error listing webhooks:", error);
  }
}

async function deleteWebhook(webhookName: string) {
  console.log(`Deleting webhook: ${webhookName}...`);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${webhookName}?key=${GEMINI_API_KEY}`,
      { method: "DELETE" }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("Failed to delete webhook:", error);
      return;
    }

    console.log("Webhook deleted successfully!");
  } catch (error) {
    console.error("Error deleting webhook:", error);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || "register";

switch (command) {
  case "register":
    registerWebhook();
    break;
  case "list":
    listWebhooks();
    break;
  case "delete":
    if (!args[1]) {
      console.error("Usage: npx ts-node scripts/register-webhook.ts delete <webhook-name>");
      console.error("Example: npx ts-node scripts/register-webhook.ts delete webhooks/abc123");
      process.exit(1);
    }
    deleteWebhook(args[1]);
    break;
  default:
    console.log("Usage:");
    console.log("  npx ts-node scripts/register-webhook.ts register  - Register a new webhook");
    console.log("  npx ts-node scripts/register-webhook.ts list      - List existing webhooks");
    console.log("  npx ts-node scripts/register-webhook.ts delete <name> - Delete a webhook");
}
