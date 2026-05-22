import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuid } from "uuid";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface BatchResult {
  custom_id: string;
  response?: {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inline_data?: { mime_type: string; data: string };
        }>;
      };
    }>;
  };
  error?: { message: string; code?: string };
}

interface ProcessedResult {
  index: number;
  customId: string;
  processedUrl?: string;
  error?: string;
}

/**
 * Download batch results from Gemini
 */
export async function downloadBatchResults(
  batchId: string
): Promise<BatchResult[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  console.log(`[BATCH] Downloading results for batch: ${batchId}`);

  // Get batch details to find output file
  const batchUrl = `https://generativelanguage.googleapis.com/v1beta/${batchId}?key=${GEMINI_API_KEY}`;
  const batchResponse = await fetch(batchUrl);

  if (!batchResponse.ok) {
    const error = await batchResponse.text();
    throw new Error(`Failed to get batch details: ${error}`);
  }

  const batch = await batchResponse.json();

  console.log(`[BATCH] Batch state: ${batch.state}`);
  console.log(`[BATCH] Batch stats:`, batch.batchStats);

  // Check if results are inlined or in a file
  if (batch.dest?.inlined_responses) {
    console.log(
      `[BATCH] Found ${batch.dest.inlined_responses.length} inlined responses`
    );
    return batch.dest.inlined_responses;
  }

  if (batch.dest?.file_name) {
    console.log(`[BATCH] Downloading results file: ${batch.dest.file_name}`);

    // Download output file
    const fileUrl = `https://generativelanguage.googleapis.com/v1beta/${batch.dest.file_name}:download?key=${GEMINI_API_KEY}&alt=media`;
    const fileResponse = await fetch(fileUrl);

    if (!fileResponse.ok) {
      const error = await fileResponse.text();
      throw new Error(`Failed to download results file: ${error}`);
    }

    const content = await fileResponse.text();

    // Parse JSONL
    const results = content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as BatchResult);

    console.log(`[BATCH] Parsed ${results.length} results from file`);

    return results;
  }

  throw new Error("No results found in batch response");
}

/**
 * Ensure a directory exists
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error: unknown) {
    // Ignore if directory already exists
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

/**
 * Process and store batch results to disk
 */
export async function processAndStoreResults(
  jobId: string,
  carId: string | null,
  results: BatchResult[]
): Promise<ProcessedResult[]> {
  // Determine output directory
  const outputDir = carId
    ? join(process.cwd(), "public/uploads/cars", carId, "processed")
    : join(process.cwd(), "public/uploads/batch", jobId);

  console.log(`[BATCH] Storing results to: ${outputDir}`);

  // Ensure directory exists
  await ensureDir(outputDir);

  const processed: ProcessedResult[] = [];

  for (const result of results) {
    const customId = result.custom_id; // "jobId_img_0" or "jobId_angle_0"

    // Extract index from custom_id
    const indexMatch = customId.match(/_(\d+)$/);
    const index = indexMatch ? parseInt(indexMatch[1], 10) : 0;

    // Check for errors
    if (result.error) {
      console.error(
        `[BATCH] Error for ${customId}: ${result.error.message}`
      );
      processed.push({
        index,
        customId,
        error: result.error.message,
      });
      continue;
    }

    try {
      // Extract image from response
      const parts = result.response?.candidates?.[0]?.content?.parts;
      const imagePart = parts?.find((p) => p.inline_data);

      if (!imagePart?.inline_data?.data) {
        // Check if it's a text-only response (angle validation)
        const textPart = parts?.find((p) => p.text);
        if (textPart?.text) {
          // For angle validation, store the JSON response
          processed.push({
            index,
            customId,
            processedUrl: textPart.text, // Store raw JSON for angle validation
          });
          continue;
        }

        processed.push({
          index,
          customId,
          error: "No image or text in response",
        });
        continue;
      }

      // Save image to disk
      const fileName = `processed_${index}_${uuid()}.png`;
      const filePath = join(outputDir, fileName);
      const imageBuffer = Buffer.from(imagePart.inline_data.data, "base64");
      await writeFile(filePath, imageBuffer);

      // Generate public URL
      const publicUrl = carId
        ? `/uploads/cars/${carId}/processed/${fileName}`
        : `/uploads/batch/${jobId}/${fileName}`;

      console.log(`[BATCH] Saved image ${index}: ${publicUrl}`);

      processed.push({
        index,
        customId,
        processedUrl: publicUrl,
      });
    } catch (error) {
      console.error(`[BATCH] Error processing result ${customId}:`, error);
      processed.push({
        index,
        customId,
        error: String(error),
      });
    }
  }

  // Sort by index
  processed.sort((a, b) => a.index - b.index);

  const successCount = processed.filter((p) => !p.error).length;
  const failCount = processed.filter((p) => p.error).length;

  console.log(
    `[BATCH] Processing complete: ${successCount} succeeded, ${failCount} failed`
  );

  return processed;
}

/**
 * Extract text results (for angle validation)
 */
export function extractTextResults(
  results: BatchResult[]
): Array<{ index: number; customId: string; text?: string; error?: string }> {
  return results.map((result) => {
    const customId = result.custom_id;
    const indexMatch = customId.match(/_(\d+)$/);
    const index = indexMatch ? parseInt(indexMatch[1], 10) : 0;

    if (result.error) {
      return { index, customId, error: result.error.message };
    }

    const textPart = result.response?.candidates?.[0]?.content?.parts?.find(
      (p) => p.text
    );

    return {
      index,
      customId,
      text: textPart?.text,
    };
  });
}
