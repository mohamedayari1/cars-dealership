"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  buildBatchJsonl,
  uploadJsonlToGemini,
  dispatchBatchJob,
  loadGarageBackgrounds,
  selectBestBackground,
  getBatchJobStatus,
} from "@/lib/batch";
import { unlink } from "fs/promises";
import { removeImageBackground } from "./image-processing";

/**
 * Create a batch processing job for multiple car images
 */
export async function createBatchProcessingJob(
  images: string[], // Array of base64 images
  carId?: string
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  console.log(
    `[BATCH-ACTION] Creating batch job for ${images.length} images`
  );

  // 1. Create job record
  const job = await prisma.imageProcessingJob.create({
    data: {
      userId: session.user.id,
      carId: carId || null,
      processType: "BATCH_COMPOSITE",
      inputImages: images.map((img, i) => ({
        index: i,
        originalLength: img.length,
      })),
      totalImages: images.length,
      status: "PENDING",
    },
  });

  console.log(`[BATCH-ACTION] Job created: ${job.id}`);

  try {
    // 2. Update status: Building file
    await prisma.imageProcessingJob.update({
      where: { id: job.id },
      data: { status: "BUILDING_FILE" },
    });

    // 3. First, remove backgrounds from all images using Remove.bg
    console.log(`[BATCH-ACTION] Removing backgrounds from ${images.length} images...`);
    const transparentImages: Array<{ index: number; base64: string }> = [];

    for (let i = 0; i < images.length; i++) {
      try {
        const result = await removeImageBackground(images[i]);
        if (result.success && result.data) {
          // Extract base64 from data URL
          const base64 = result.data.includes(",")
            ? result.data.split(",")[1]
            : result.data;
          transparentImages.push({ index: i, base64 });
        } else {
          console.warn(`[BATCH-ACTION] Background removal failed for image ${i}: ${result.error}`);
          // Use original image as fallback
          const base64 = images[i].includes(",")
            ? images[i].split(",")[1]
            : images[i];
          transparentImages.push({ index: i, base64 });
        }
      } catch (error) {
        console.error(`[BATCH-ACTION] Error removing background for image ${i}:`, error);
        const base64 = images[i].includes(",")
          ? images[i].split(",")[1]
          : images[i];
        transparentImages.push({ index: i, base64 });
      }
    }

    // 4. Load backgrounds and prepare batch data
    const backgrounds = await loadGarageBackgrounds();
    const batchImages = await Promise.all(
      transparentImages.map(async ({ index, base64 }) => {
        const background = await selectBestBackground(base64, backgrounds, index);
        return { index, base64, backgroundBase64: background.base64 };
      })
    );

    // 5. Build JSONL file
    const jsonlPath = await buildBatchJsonl(job.id, batchImages);
    console.log(`[BATCH-ACTION] JSONL file built: ${jsonlPath}`);

    // 6. Update status: Uploading
    await prisma.imageProcessingJob.update({
      where: { id: job.id },
      data: { status: "UPLOADING_FILE" },
    });

    // 7. Upload to Gemini Files API
    const geminiFileId = await uploadJsonlToGemini(jsonlPath);
    console.log(`[BATCH-ACTION] File uploaded: ${geminiFileId}`);

    // 8. Clean up temp file
    try {
      await unlink(jsonlPath);
    } catch {
      // Ignore cleanup errors
    }

    // 9. Dispatch batch job with webhook
    const batchResult = await dispatchBatchJob(geminiFileId, job.id);
    console.log(`[BATCH-ACTION] Batch dispatched: ${batchResult.name}`);

    // 10. Update job with Gemini IDs
    await prisma.imageProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "SUBMITTED",
        geminiBatchId: batchResult.name,
        geminiFileId: geminiFileId,
        submittedAt: new Date(),
      },
    });

    return {
      success: true,
      jobId: job.id,
      batchId: batchResult.name,
      status: "SUBMITTED",
      message: `Batch job submitted with ${images.length} images. You'll be notified when complete.`,
    };
  } catch (error) {
    console.error(`[BATCH-ACTION] Error creating batch job:`, error);

    // Update job as failed
    await prisma.imageProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorMessage: String(error),
        completedAt: new Date(),
      },
    });

    return {
      success: false,
      jobId: job.id,
      error: String(error),
    };
  }
}

/**
 * Get the status of a processing job
 */
export async function getJobStatus(jobId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const job = await prisma.imageProcessingJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    throw new Error("Job not found");
  }

  // Check if user owns this job
  if (job.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  return {
    id: job.id,
    status: job.status,
    totalImages: job.totalImages,
    processedCount: job.processedCount,
    failedCount: job.failedCount,
    results: job.status === "SUCCEEDED" ? job.results : null,
    error: job.errorMessage,
    createdAt: job.createdAt,
    submittedAt: job.submittedAt,
    completedAt: job.completedAt,
  };
}

/**
 * Poll Gemini for job status (fallback if webhook doesn't arrive)
 */
export async function pollBatchStatus(jobId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const job = await prisma.imageProcessingJob.findUnique({
    where: { id: jobId },
  });

  if (!job || job.userId !== session.user.id) {
    throw new Error("Job not found or unauthorized");
  }

  if (!job.geminiBatchId) {
    return { status: job.status, message: "Batch not yet submitted" };
  }

  // Don't poll if already completed
  if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) {
    return { status: job.status, results: job.results };
  }

  try {
    const batchStatus = await getBatchJobStatus(job.geminiBatchId);

    // Map Gemini status to our status
    const stateMap: Record<string, string> = {
      JOB_STATE_PENDING: "SUBMITTED",
      JOB_STATE_RUNNING: "PROCESSING",
      JOB_STATE_SUCCEEDED: "SUCCEEDED",
      JOB_STATE_FAILED: "FAILED",
      JOB_STATE_CANCELLED: "CANCELLED",
    };

    const newStatus = stateMap[batchStatus.state] || job.status;

    // Update if status changed
    if (newStatus !== job.status) {
      await prisma.imageProcessingJob.update({
        where: { id: job.id },
        data: { status: newStatus as typeof job.status },
      });
    }

    return {
      status: newStatus,
      geminiState: batchStatus.state,
      batchStats: batchStatus.batchStats,
    };
  } catch (error) {
    console.error(`[BATCH-ACTION] Error polling batch status:`, error);
    return { status: job.status, error: String(error) };
  }
}

/**
 * Get all jobs for the current user
 */
export async function getUserJobs(limit: number = 10) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const jobs = await prisma.imageProcessingJob.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      processType: true,
      totalImages: true,
      processedCount: true,
      failedCount: true,
      createdAt: true,
      completedAt: true,
      errorMessage: true,
    },
  });

  return jobs;
}

/**
 * Cancel a pending job
 */
export async function cancelJob(jobId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const job = await prisma.imageProcessingJob.findUnique({
    where: { id: jobId },
  });

  if (!job || job.userId !== session.user.id) {
    throw new Error("Job not found or unauthorized");
  }

  // Can only cancel jobs that are not yet completed
  if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(job.status)) {
    throw new Error("Cannot cancel a completed job");
  }

  await prisma.imageProcessingJob.update({
    where: { id: job.id },
    data: {
      status: "CANCELLED",
      errorMessage: "Cancelled by user",
      completedAt: new Date(),
    },
  });

  return { success: true };
}
