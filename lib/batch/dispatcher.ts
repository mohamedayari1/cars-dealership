const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BATCHES_URL =
  "https://generativelanguage.googleapis.com/v1beta/batches";

interface BatchJobResponse {
  name: string; // "batches/abc123"
  state: string; // "JOB_STATE_PENDING"
  displayName?: string;
  createTime: string;
  updateTime?: string;
}

interface WebhookConfig {
  uris: string[];
  user_metadata?: Record<string, string>;
}

interface BatchConfig {
  display_name?: string;
  webhook_config?: WebhookConfig;
}

/**
 * Dispatch a batch job to Gemini Batch API
 */
export async function dispatchBatchJob(
  geminiFileId: string,
  jobId: string,
  model: string = "models/gemini-2.0-flash"
): Promise<BatchJobResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new Error("APP_URL is not configured for webhook callbacks");
  }

  const webhookUrl = `${appUrl}/api/webhooks/gemini`;

  console.log(`[BATCH] Dispatching batch job for file: ${geminiFileId}`);
  console.log(`[BATCH] Webhook URL: ${webhookUrl}`);

  const config: BatchConfig = {
    display_name: `car_composite_${jobId}`,
    webhook_config: {
      uris: [webhookUrl],
      user_metadata: {
        job_id: jobId,
        type: "car_image_processing",
      },
    },
  };

  const response = await fetch(`${GEMINI_BATCHES_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      src: geminiFileId,
      config: config,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Batch dispatch failed: ${JSON.stringify(error)}`);
  }

  const result: BatchJobResponse = await response.json();

  console.log(`[BATCH] Batch job dispatched: ${result.name}`);
  console.log(`[BATCH] Initial state: ${result.state}`);

  return result;
}

/**
 * Get the status of a batch job
 */
export async function getBatchJobStatus(
  batchId: string
): Promise<BatchJobResponse & { batchStats?: BatchStats; dest?: BatchDest }> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${batchId}?key=${GEMINI_API_KEY}`
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get batch status: ${error}`);
  }

  return response.json();
}

/**
 * Cancel a batch job
 */
export async function cancelBatchJob(batchId: string): Promise<void> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${batchId}:cancel?key=${GEMINI_API_KEY}`,
    { method: "POST" }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to cancel batch: ${error}`);
  }

  console.log(`[BATCH] Batch job cancelled: ${batchId}`);
}

/**
 * List all batch jobs
 */
export async function listBatchJobs(
  pageSize: number = 10,
  pageToken?: string
): Promise<{ batches: BatchJobResponse[]; nextPageToken?: string }> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const params = new URLSearchParams({
    key: GEMINI_API_KEY,
    pageSize: String(pageSize),
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const response = await fetch(`${GEMINI_BATCHES_URL}?${params.toString()}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list batches: ${error}`);
  }

  return response.json();
}

interface BatchStats {
  totalRequestCount: number;
  succeededRequestCount: number;
  failedRequestCount: number;
}

interface BatchDest {
  file_name?: string;
  inlined_responses?: Array<{
    custom_id: string;
    response?: unknown;
    error?: { message: string };
  }>;
}
