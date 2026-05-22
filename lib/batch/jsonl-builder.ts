import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { v4 as uuid } from "uuid";

interface BatchRequest {
  custom_id: string;
  contents: Array<{
    role: string;
    parts: Array<{
      text?: string;
      inline_data?: { mime_type: string; data: string };
    }>;
  }>;
  config?: {
    response_modalities?: string[];
    image_config?: { aspect_ratio?: string; image_size?: string };
  };
}

interface BatchImageInput {
  index: number;
  base64: string;
  backgroundBase64: string;
}

const COMPOSITING_PROMPT = `You are an expert photo compositor specializing in automotive photography.
Place this car (transparent background) realistically into this garage scene.

===== CRITICAL CONSTRAINTS - DO NOT VIOLATE =====
1. NEVER modify, complete, enhance, or alter the car image in ANY way
2. If the car appears partial, cropped, or incomplete - leave it EXACTLY as provided
3. Do NOT add missing parts (wheels, doors, bumpers, mirrors, etc.)
4. Do NOT fix damage, scratches, or imperfections on the car
5. Do NOT change the car's color, shape, or proportions
6. The car pixels must remain IDENTICAL to the input - only add shadows BELOW/AROUND the car
7. If the input shows half a car, the output MUST show exactly half a car

===== ALLOWED OPERATIONS ONLY =====
- Add shadows under and around the car
- Add floor reflections (reflection of the car as-is, not a "fixed" version)
- Adjust overall brightness/contrast to match scene lighting
- Position the car in the scene

SHADOW REQUIREMENTS:
1. CONTACT SHADOW: Add a dark, sharp shadow directly under the car where tires touch the floor
2. AMBIENT OCCLUSION: Add soft, diffused shadows in the gap between car undercarriage and floor
3. CAST SHADOW: Add a softer, elongated shadow extending from the car
4. Shadow edges should be slightly blurred/feathered, not hard-cut

COMPOSITION:
- Position car naturally on the garage floor (not floating)
- Maintain car's EXACT original proportions - DO NOT SCALE OR DISTORT
- Preserve company branding on walls
- Add subtle floor reflection if floor is glossy

Output a photorealistic composite where the car appears exactly as provided, just placed in this environment.`;

/**
 * Build a JSONL file for Gemini Batch API processing
 */
export async function buildBatchJsonl(
  jobId: string,
  images: BatchImageInput[]
): Promise<string> {
  const requests: BatchRequest[] = images.map(
    ({ index, base64, backgroundBase64 }) => ({
      custom_id: `${jobId}_img_${index}`,
      contents: [
        {
          role: "user",
          parts: [
            { text: COMPOSITING_PROMPT },
            { inline_data: { mime_type: "image/png", data: base64 } },
            { inline_data: { mime_type: "image/jpeg", data: backgroundBase64 } },
          ],
        },
      ],
      config: {
        response_modalities: ["Text", "Image"],
        image_config: { aspect_ratio: "16:9", image_size: "2K" },
      },
    })
  );

  // Write JSONL (one JSON object per line)
  const jsonlContent = requests.map((r) => JSON.stringify(r)).join("\n");

  // Save to temp file
  const filePath = join(tmpdir(), `batch_${jobId}_${uuid()}.jsonl`);
  await writeFile(filePath, jsonlContent);

  console.log(
    `[BATCH] Built JSONL file with ${images.length} requests: ${filePath}`
  );

  return filePath;
}

/**
 * Build JSONL for angle validation batch
 */
export async function buildAngleValidationJsonl(
  jobId: string,
  images: Array<{ index: number; base64: string }>
): Promise<string> {
  const ANGLE_VALIDATION_PROMPT = `Analyze this car image and determine the camera angle/perspective.

Classify into ONE of these categories:
- front-3/4: Front view at approximately 45 degrees (shows front and one side)
- front: Directly facing the front of the car
- side: Side profile view (perpendicular to car, showing full side)
- rear-3/4: Rear view at approximately 45 degrees (shows back and one side)
- rear: Directly facing the rear of the car
- interior: Dashboard, cabin, or interior view
- detail: Close-up of specific feature (wheel, badge, etc.)
- unknown: Cannot determine or not a car image

Also assess the image quality:
- Is the entire car visible in frame? (not cropped off)
- Is the image well-lit and clear?
- Is the car the main subject of the photo?

IMPORTANT: Respond with ONLY valid JSON, no other text:
{
  "angle": "category-id-from-above",
  "confidence": 0.85,
  "isCarComplete": true,
  "isWellLit": true,
  "isCarMainSubject": true,
  "issues": []
}`;

  const requests = images.map(({ index, base64 }) => ({
    custom_id: `${jobId}_angle_${index}`,
    contents: [
      {
        role: "user",
        parts: [
          { text: ANGLE_VALIDATION_PROMPT },
          { inline_data: { mime_type: "image/png", data: base64 } },
        ],
      },
    ],
  }));

  const jsonlContent = requests.map((r) => JSON.stringify(r)).join("\n");
  const filePath = join(tmpdir(), `batch_angle_${jobId}_${uuid()}.jsonl`);
  await writeFile(filePath, jsonlContent);

  console.log(
    `[BATCH] Built angle validation JSONL with ${images.length} requests: ${filePath}`
  );

  return filePath;
}
