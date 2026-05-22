"use server";

import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import path from "path";

// Configuration
const GARAGE_BACKGROUNDS_DIR = process.env.GARAGE_BACKGROUNDS_DIR || "public/assets";
const GARAGE_BACKGROUND_PATTERN = /^garage-background.*\.(png|jpg|jpeg)$/i;

/**
 * Remove background from car image using Remove.bg API
 * and composite into garage scene using Gemini AI
 */
export async function removeImageBackground(imageBase64) {
  console.log("\n🚗 [IMAGE PIPELINE] Starting image processing...");
  const startTime = Date.now();

  try {
    const apiKey = process.env.REMOVEBG_API_KEY;

    if (!apiKey) {
      throw new Error("REMOVEBG_API_KEY is not configured");
    }

    // Extract base64 data (remove data:image/xxx;base64, prefix)
    const base64Data = imageBase64.includes(",")
      ? imageBase64.split(",")[1]
      : imageBase64;

    // Step 1: Call Remove.bg API - get transparent background
    console.log("📤 [STEP 1/2] Calling Remove.bg API to remove background...");
    const removeBgStart = Date.now();

    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_file_b64: base64Data,
        size: "auto",
        format: "png",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.errors?.[0]?.title || `Remove.bg API error: ${response.status}`
      );
    }

    // Get the transparent car image
    const processedImageBuffer = await response.arrayBuffer();
    const transparentCarBase64 = Buffer.from(processedImageBuffer).toString("base64");

    console.log(`✅ [STEP 1/2] Remove.bg completed in ${Date.now() - removeBgStart}ms`);

    // Step 2: Composite with garage using Gemini AI
    console.log("🎨 [STEP 2/2] Calling Gemini AI to composite car into garage...");
    const geminiStart = Date.now();

    const finalImage = await compositeWithGemini(transparentCarBase64);

    console.log(`✅ [STEP 2/2] Gemini compositing completed in ${Date.now() - geminiStart}ms`);
    console.log(`🏁 [IMAGE PIPELINE] Total processing time: ${Date.now() - startTime}ms\n`);

    return {
      success: true,
      data: `data:image/png;base64,${finalImage}`,
    };
  } catch (error) {
    console.error("❌ [IMAGE PIPELINE] Error:", error.message);
    return {
      success: false,
      error: error.message || "Failed to process image",
    };
  }
}

/**
 * Load all available garage backgrounds from the assets directory
 */
async function loadGarageBackgrounds() {
  const backgroundsDir = path.join(process.cwd(), GARAGE_BACKGROUNDS_DIR);
  const files = await fs.readdir(backgroundsDir);

  const backgrounds = [];
  for (const file of files) {
    if (GARAGE_BACKGROUND_PATTERN.test(file)) {
      const filePath = path.join(backgroundsDir, file);
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(file).toLowerCase();
      backgrounds.push({
        name: file,
        path: filePath,
        base64: buffer.toString("base64"),
        mimeType: ext === ".png" ? "image/png" : "image/jpeg",
      });
    }
  }

  return backgrounds;
}

/**
 * Use Gemini to analyze the car angle and select the best matching background
 */
async function selectBackgroundWithGemini(ai, carImageBase64, backgrounds) {
  if (backgrounds.length === 1) {
    console.log(`   📷 Only one background available, using: ${backgrounds[0].name}`);
    return backgrounds[0];
  }

  console.log(`   🔍 Analyzing car angle to select best background from ${backgrounds.length} options...`);

  const backgroundDescriptions = backgrounds.map((bg, i) => `${i + 1}. ${bg.name}`).join("\n");

  const selectionPrompt = `Analyze this car image and determine its viewing angle (front, rear, left side, right side, front-left, front-right, rear-left, rear-right, etc.).

Then, from these available garage background images, select the ONE that would work best for this car's angle. Consider:
- The camera perspective of the background should match the car's angle
- The lighting direction should be complementary
- The composition should look natural

Available backgrounds:
${backgroundDescriptions}

IMPORTANT: Respond with ONLY the number of your chosen background (e.g., "1" or "2"). Nothing else.`;

  try {
    // Build content parts with car image and all background thumbnails
    const parts = [
      { text: selectionPrompt },
      {
        inlineData: {
          mimeType: "image/png",
          data: carImageBase64,
        },
      },
      { text: "\n\nAvailable background images:" },
    ];

    // Add all backgrounds for Gemini to see
    for (const bg of backgrounds) {
      parts.push({
        inlineData: {
          mimeType: bg.mimeType,
          data: bg.base64,
        },
      });
      parts.push({ text: `(${bg.name})` });
    }

    const result = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [{ role: "user", parts }],
    });

    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    const selectedIndex = parseInt(responseText, 10) - 1;

    if (selectedIndex >= 0 && selectedIndex < backgrounds.length) {
      console.log(`   ✅ Gemini selected background: ${backgrounds[selectedIndex].name}`);
      return backgrounds[selectedIndex];
    }

    console.log(`   ⚠️  Could not parse Gemini response: "${responseText}", using first background`);
    return backgrounds[0];
  } catch (error) {
    console.log(`   ⚠️  Background selection failed: ${error.message}, using first background`);
    return backgrounds[0];
  }
}

/**
 * Use Gemini 3.1 Flash Image to composite the car into a garage scene
 * with realistic shadows and lighting
 */
async function compositeWithGemini(carImageBase64) {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Load all available garage backgrounds
  console.log("   📂 Loading garage background images...");
  const backgrounds = await loadGarageBackgrounds();

  if (backgrounds.length === 0) {
    throw new Error(
      `No garage backgrounds found in ${GARAGE_BACKGROUNDS_DIR}. Please add images matching pattern: garage-background*.png/jpg`
    );
  }

  console.log(`   ✅ Found ${backgrounds.length} garage background(s): ${backgrounds.map(b => b.name).join(", ")}`);

  // Initialize Gemini
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  // Select the best background based on car angle
  const selectedBackground = await selectBackgroundWithGemini(ai, carImageBase64, backgrounds);

  console.log(`   🏢 Using garage background: ${selectedBackground.name}`);

  const garageBackgroundBase64 = selectedBackground.base64;
  const garageMimeType = selectedBackground.mimeType;

  // Create the compositing prompt
  console.log("   🎨 Compositing car into selected background...");
  const prompt = `You are an expert photo compositor specializing in automotive photography.
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
1. CONTACT SHADOW: Add a dark, sharp shadow directly under the car where tires touch the floor (opacity ~70-80%)
2. AMBIENT OCCLUSION: Add soft, diffused shadows in the gap between car undercarriage and floor
3. CAST SHADOW: Add a softer, elongated shadow extending from the car based on the garage's light source direction
4. Shadow edges should be slightly blurred/feathered, not hard-cut

LIGHTING REQUIREMENTS:
- Match scene brightness/contrast only - do NOT add new highlights or reflections to the car body
- Ensure consistent light direction between car and environment

COMPOSITION:
- Position car naturally on the garage floor (not floating)
- Maintain car's EXACT original proportions - DO NOT SCALE OR DISTORT
- Preserve company branding on walls
- Add subtle floor reflection if floor is glossy (reflection of the car exactly as-is)

Output a photorealistic composite where the car appears exactly as provided, just placed in this environment.`;

  try {
    console.log("   📡 Sending request to Gemini API...");
    const result = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/png",
                data: carImageBase64,
              },
            },
            {
              inlineData: {
                mimeType: garageMimeType,
                data: garageBackgroundBase64,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ["Text", "Image"],
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "2K",
        },
      },
    });

    console.log("   📥 Received response from Gemini, extracting image...");

    // Extract the generated image from the response
    const part = result.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData
    );

    if (part?.inlineData) {
      console.log("   ✅ Image successfully generated by Gemini");
      return part.inlineData.data;
    }

    throw new Error("No image generated by Gemini");
  } catch (error) {
    console.error("   ❌ Gemini compositing error:", error.message);

    // Fallback: simple composite with Sharp if Gemini fails
    console.log("   ⚠️  Falling back to simple Sharp composite...");
    return await fallbackComposite(carImageBase64, garageBackgroundBase64);
  }
}

/**
 * Fallback: Simple Sharp-based composite if Gemini fails
 */
async function fallbackComposite(carBase64, backgroundBase64) {
  console.log("   🔧 [FALLBACK] Using Sharp for simple composite...");
  const carBuffer = Buffer.from(carBase64, "base64");
  const bgBuffer = Buffer.from(backgroundBase64, "base64");

  // Get car dimensions
  const carMeta = await sharp(carBuffer).metadata();
  console.log(`   📐 [FALLBACK] Car dimensions: ${carMeta.width}x${carMeta.height}`);

  // Resize background to match car dimensions
  const resizedBg = await sharp(bgBuffer)
    .resize(carMeta.width, carMeta.height, { fit: "cover" })
    .toBuffer();

  // Simple composite: car on top of background
  const result = await sharp(resizedBg)
    .composite([
      {
        input: carBuffer,
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  console.log("   ✅ [FALLBACK] Sharp composite completed");
  return result.toString("base64");
}

// ============================================
// INTERIOR IMAGE PROCESSING
// ============================================

/**
 * Interior processing strategy configuration
 * Change this to swap between different implementations
 */
const INTERIOR_PROCESSING_STRATEGY = process.env.INTERIOR_PROCESSING_STRATEGY || "gemini";

/**
 * Process interior car image by whitening window regions for privacy
 * This is the main entry point - delegates to the configured strategy
 */
export async function processInteriorImage(imageBase64) {
  console.log("\n🏠 [INTERIOR PIPELINE] Starting interior image processing...");
  console.log(`   📋 Using strategy: ${INTERIOR_PROCESSING_STRATEGY}`);
  const startTime = Date.now();

  try {
    let result;

    switch (INTERIOR_PROCESSING_STRATEGY) {
      case "removebg":
        result = await processInteriorWithRemoveBg(imageBase64);
        break;
      case "gemini":
      default:
        result = await processInteriorWithGemini(imageBase64);
        break;
    }

    console.log(`🏁 [INTERIOR PIPELINE] Total processing time: ${Date.now() - startTime}ms\n`);
    return result;
  } catch (error) {
    console.error("❌ [INTERIOR PIPELINE] Error:", error.message);
    return {
      success: false,
      error: error.message || "Failed to process interior image",
    };
  }
}

/**
 * Strategy 1: Use Gemini AI to detect and whiten window regions
 * Pros: Smart detection, handles complex window shapes
 * Cons: May alter other parts of the image
 */
async function processInteriorWithGemini(imageBase64) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const base64Data = imageBase64.includes(",")
    ? imageBase64.split(",")[1]
    : imageBase64;

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  const prompt = `You are an expert automotive photo editor specializing in interior car photography for dealership listings.

===== TASK =====
Edit this car interior photo to WHITE OUT all window areas for privacy protection.

===== WHAT TO WHITEN (make pure white #FFFFFF) =====
1. WINDSHIELD: The entire front windshield area showing outside view
2. SIDE WINDOWS: All side window glass showing exterior scenery
3. REAR WINDOW: Back window/rear glass if visible
4. SUNROOF: Any sunroof/moonroof glass showing sky
5. MIRRORS: Rearview mirror reflection if showing outside

===== WHAT TO PRESERVE EXACTLY (DO NOT MODIFY) =====
1. Dashboard, instrument cluster, infotainment screen
2. Steering wheel, gear shifter, center console
3. Seats (front and back), headrests
4. Door panels, door handles, armrests
5. Ceiling/headliner (non-glass parts)
6. Floor mats, pedals
7. All interior trim, vents, controls

===== TECHNICAL REQUIREMENTS =====
- Window areas should be PURE WHITE (#FFFFFF), not gray or tinted
- Maintain sharp edges where interior meets window
- Keep all interior colors, textures, and details intact
- Do NOT crop or resize the image
- Do NOT add any elements that weren't in the original

Output the edited image with windows whitened.`;

  console.log("   🪟 Sending to Gemini for window whitening...");

  const result = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Data,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ["Text", "Image"],
      imageConfig: {
        aspectRatio: "16:9",
        imageSize: "2K",
      },
    },
  });

  const imagePart = result.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData
  );

  if (imagePart?.inlineData) {
    console.log("   ✅ Gemini window whitening completed");
    return {
      success: true,
      data: `data:image/png;base64,${imagePart.inlineData.data}`,
    };
  }

  throw new Error("No image generated by Gemini");
}

/**
 * Strategy 2: Use Remove.bg API with white background
 * Pros: Reliable, consistent results
 * Cons: Removes entire background, not just windows
 *
 * This could work if you want to isolate the interior and place on white
 */
async function processInteriorWithRemoveBg(imageBase64) {
  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) {
    throw new Error("REMOVEBG_API_KEY is not configured");
  }

  const base64Data = imageBase64.includes(",")
    ? imageBase64.split(",")[1]
    : imageBase64;

  console.log("   🪟 Sending to Remove.bg for background removal...");

  const response = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_file_b64: base64Data,
      size: "auto",
      format: "png",
      bg_color: "FFFFFF", // White background
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.errors?.[0]?.title || `Remove.bg API error: ${response.status}`
    );
  }

  const processedImageBuffer = await response.arrayBuffer();
  const processedBase64 = Buffer.from(processedImageBuffer).toString("base64");

  console.log("   ✅ Remove.bg processing completed");
  return {
    success: true,
    data: `data:image/png;base64,${processedBase64}`,
  };
}

// ============================================
// ANGLE VALIDATION
// ============================================

/**
 * Car angles for listing - none are required, just informational
 */
const REQUIRED_ANGLES = [
  { id: "front-3/4", name: "Front 3/4 View", required: false, description: "Front of car at ~45° angle" },
  { id: "front", name: "Front View", required: false, description: "Direct front view" },
  { id: "side", name: "Side Profile", required: false, description: "Full side view of car" },
  { id: "rear-3/4", name: "Rear 3/4 View", required: false, description: "Rear at ~45° angle" },
  { id: "rear", name: "Rear View", required: false, description: "Back of car visible" },
  { id: "interior", name: "Interior", required: false, description: "Dashboard or cabin" },
];

/**
 * Get the list of required angles configuration
 */
export async function getRequiredAngles() {
  return REQUIRED_ANGLES;
}

/**
 * Validate a single car image angle using Gemini AI
 */
export async function validateCarAngle(imageBase64) {
  console.log("🔍 [ANGLE VALIDATION] Analyzing image angle...");

  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Extract base64 data (remove data:image/xxx;base64, prefix)
  const base64Data = imageBase64.includes(",")
    ? imageBase64.split(",")[1]
    : imageBase64;

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  const prompt = `Analyze this car image and determine the camera angle/perspective.

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
}

If there are issues, list them in the issues array, e.g.: ["car is partially cropped", "image is too dark"]`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Data,
              },
            },
          ],
        },
      ],
    });

    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const validation = JSON.parse(jsonMatch[0]);
      console.log(`✅ [ANGLE VALIDATION] Detected angle: ${validation.angle} (confidence: ${validation.confidence})`);
      return {
        success: true,
        ...validation,
      };
    }

    throw new Error("Could not parse validation response");
  } catch (error) {
    console.error("❌ [ANGLE VALIDATION] Error:", error.message);
    return {
      success: false,
      angle: "unknown",
      confidence: 0,
      isCarComplete: false,
      isWellLit: false,
      isCarMainSubject: false,
      issues: [error.message],
    };
  }
}

/**
 * Validate all uploaded images and check for required angles
 */
export async function validateCarImages(images) {
  console.log(`\n📸 [ANGLE VALIDATION] Validating ${images.length} image(s)...`);
  const startTime = Date.now();

  // Validate each image
  const results = await Promise.all(
    images.map(async (img, index) => {
      console.log(`   Processing image ${index + 1}/${images.length}...`);
      const validation = await validateCarAngle(img);
      return {
        index,
        validation,
      };
    })
  );

  // Determine which angles were detected
  const detectedAngles = new Set();
  for (const result of results) {
    if (result.validation.success && result.validation.angle !== "unknown") {
      detectedAngles.add(result.validation.angle);
    }
  }

  // Check which required angles are missing
  const missingRequired = REQUIRED_ANGLES
    .filter((angle) => angle.required && !detectedAngles.has(angle.id))
    .map((angle) => ({ id: angle.id, name: angle.name }));

  const isComplete = missingRequired.length === 0;

  console.log(`✅ [ANGLE VALIDATION] Completed in ${Date.now() - startTime}ms`);
  console.log(`   Detected angles: ${Array.from(detectedAngles).join(", ") || "none"}`);
  console.log(`   Missing required: ${missingRequired.map((a) => a.name).join(", ") || "none"}`);
  console.log(`   Is complete: ${isComplete}\n`);

  return {
    success: true,
    imageResults: results,
    detectedAngles: Array.from(detectedAngles),
    missingRequired,
    isComplete,
    requiredAngles: REQUIRED_ANGLES,
  };
}
