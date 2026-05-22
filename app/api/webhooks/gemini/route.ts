import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { prisma } from "@/lib/prisma";
import { downloadBatchResults, processAndStoreResults } from "@/lib/batch";

const WEBHOOK_SECRET = process.env.GEMINI_WEBHOOK_SECRET;

interface WebhookEvent {
  type:
    | "batch.succeeded"
    | "batch.failed"
    | "batch.cancelled"
    | "batch.expired";
  version: string;
  timestamp: string;
  data: {
    id: string;
    output_file_uri?: string;
    error_code?: string;
    error_message?: string;
  };
}

/**
 * Handle Gemini Batch API webhook callbacks
 */
export async function POST(request: NextRequest) {
  const payload = await request.text();

  // Build headers object for verification
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  console.log(`[WEBHOOK] Received webhook request`);

  // Verify webhook signature if secret is configured
  let event: WebhookEvent;

  if (WEBHOOK_SECRET) {
    try {
      const wh = new Webhook(WEBHOOK_SECRET);
      event = wh.verify(payload, headers) as WebhookEvent;
      console.log(`[WEBHOOK] Signature verified successfully`);
    } catch (err) {
      console.error(`[WEBHOOK] Signature verification failed:`, err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    // In development, allow unsigned webhooks
    console.warn(
      `[WEBHOOK] No GEMINI_WEBHOOK_SECRET configured - skipping signature verification`
    );
    try {
      event = JSON.parse(payload) as WebhookEvent;
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
  }

  console.log(`[WEBHOOK] Event type: ${event.type}`);
  console.log(`[WEBHOOK] Batch ID: ${event.data.id}`);

  // Find our job record by Gemini batch ID
  const job = await prisma.imageProcessingJob.findFirst({
    where: { geminiBatchId: event.data.id },
  });

  if (!job) {
    console.warn(`[WEBHOOK] No job found for batch ${event.data.id}`);
    // Return 200 anyway to prevent retries
    return NextResponse.json({ error: "Job not found" }, { status: 200 });
  }

  console.log(`[WEBHOOK] Found job: ${job.id}`);

  // Handle event type
  try {
    switch (event.type) {
      case "batch.succeeded":
        await handleBatchSucceeded(job, event.data);
        break;

      case "batch.failed":
        await handleBatchFailed(job, event.data);
        break;

      case "batch.cancelled":
      case "batch.expired":
        await prisma.imageProcessingJob.update({
          where: { id: job.id },
          data: {
            status: "CANCELLED",
            errorMessage: `Batch ${event.type.replace("batch.", "")}`,
            completedAt: new Date(),
          },
        });
        console.log(`[WEBHOOK] Job ${job.id} marked as ${event.type}`);
        break;
    }
  } catch (error) {
    console.error(`[WEBHOOK] Error handling event:`, error);
    // Still return 200 to prevent infinite retries
  }

  // Return 200 immediately (important for webhooks)
  return NextResponse.json({ received: true });
}

/**
 * Handle successful batch completion
 */
async function handleBatchSucceeded(
  job: { id: string; carId: string | null },
  data: { id: string; output_file_uri?: string }
) {
  console.log(`[WEBHOOK] Processing successful batch: ${data.id}`);

  try {
    // Update status to PROCESSING while we download results
    await prisma.imageProcessingJob.update({
      where: { id: job.id },
      data: { status: "PROCESSING" },
    });

    // Download results from Gemini
    const results = await downloadBatchResults(data.id);
    console.log(`[WEBHOOK] Downloaded ${results.length} results`);

    // Process and store images
    const processedResults = await processAndStoreResults(
      job.id,
      job.carId,
      results
    );

    // Calculate stats
    const successCount = processedResults.filter((r) => !r.error).length;
    const failCount = processedResults.filter((r) => r.error).length;

    // Update job record
    await prisma.imageProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        results: processedResults as unknown as object,
        processedCount: successCount,
        failedCount: failCount,
        completedAt: new Date(),
      },
    });

    console.log(
      `[WEBHOOK] Job ${job.id} completed: ${successCount} succeeded, ${failCount} failed`
    );
  } catch (error) {
    console.error(`[WEBHOOK] Error processing batch results:`, error);

    // Mark as failed
    await prisma.imageProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorMessage: `Error processing results: ${String(error)}`,
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Handle batch failure
 */
async function handleBatchFailed(
  job: { id: string },
  data: { id: string; error_code?: string; error_message?: string }
) {
  console.log(`[WEBHOOK] Batch failed: ${data.id}`);
  console.log(`[WEBHOOK] Error code: ${data.error_code}`);
  console.log(`[WEBHOOK] Error message: ${data.error_message}`);

  await prisma.imageProcessingJob.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      errorMessage:
        data.error_message || `Batch failed with code: ${data.error_code}`,
      completedAt: new Date(),
    },
  });
}

/**
 * GET endpoint for health check / debugging
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Gemini webhook endpoint is active",
    secretConfigured: !!WEBHOOK_SECRET,
  });
}
