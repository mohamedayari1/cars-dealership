import { readFile } from "fs/promises";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_FILES_URL =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";

interface FileUploadResult {
  name: string; // "files/abc123xyz"
  displayName: string;
  mimeType: string;
  sizeBytes: string;
  createTime: string;
  expirationTime: string;
  state: string;
}

/**
 * Upload a JSONL file to Gemini Files API for batch processing
 */
export async function uploadJsonlToGemini(filePath: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const fileContent = await readFile(filePath);
  const fileName = filePath.split("/").pop() || "batch.jsonl";

  console.log(
    `[BATCH] Uploading file to Gemini: ${fileName} (${fileContent.length} bytes)`
  );

  // Step 1: Initiate resumable upload
  const initResponse = await fetch(`${GEMINI_FILES_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(fileContent.length),
      "X-Goog-Upload-Header-Content-Type": "application/jsonl",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: { display_name: fileName },
    }),
  });

  if (!initResponse.ok) {
    const error = await initResponse.text();
    throw new Error(`Failed to initiate upload: ${error}`);
  }

  const uploadUrl = initResponse.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    throw new Error("Failed to get upload URL from Gemini");
  }

  // Step 2: Upload file content
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
      "Content-Type": "application/jsonl",
    },
    body: fileContent,
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Failed to upload file content: ${error}`);
  }

  const result: { file: FileUploadResult } = await uploadResponse.json();

  console.log(`[BATCH] File uploaded successfully: ${result.file.name}`);

  return result.file.name; // "files/abc123xyz"
}

/**
 * Check the state of an uploaded file
 */
export async function getFileState(
  fileId: string
): Promise<{ state: string; name: string }> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${fileId}?key=${GEMINI_API_KEY}`
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get file state: ${error}`);
  }

  return response.json();
}

/**
 * Wait for file to be processed (state: ACTIVE)
 */
export async function waitForFileActive(
  fileId: string,
  maxWaitMs: number = 60000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const file = await getFileState(fileId);

    if (file.state === "ACTIVE") {
      console.log(`[BATCH] File ${fileId} is now ACTIVE`);
      return;
    }

    if (file.state === "FAILED") {
      throw new Error(`File processing failed: ${fileId}`);
    }

    // Wait 2 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`Timeout waiting for file to become ACTIVE: ${fileId}`);
}

/**
 * Delete a file from Gemini Files API
 */
export async function deleteGeminiFile(fileId: string): Promise<void> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${fileId}?key=${GEMINI_API_KEY}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    console.warn(`[BATCH] Failed to delete file ${fileId}`);
  } else {
    console.log(`[BATCH] Deleted file: ${fileId}`);
  }
}
