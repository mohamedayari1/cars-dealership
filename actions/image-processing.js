"use server";

import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import path from "path";

// Configuration
const GARAGE_BACKGROUND_PATH = process.env.GARAGE_BACKGROUND_PATH || "public/assets/garage-background.png";

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
 * Use Gemini 3.1 Flash Image to composite the car into a garage scene
 * with realistic shadows and lighting
 */
async function compositeWithGemini(carImageBase64) {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  // Load garage background image
  console.log("   📂 Loading garage background image...");
  const garageBackgroundPath = path.join(process.cwd(), GARAGE_BACKGROUND_PATH);
  let garageBackgroundBase64;

  try {
    const garageBuffer = await fs.readFile(garageBackgroundPath);
    garageBackgroundBase64 = garageBuffer.toString("base64");
    console.log(`   ✅ Loaded garage background: ${GARAGE_BACKGROUND_PATH}`);
  } catch (error) {
    throw new Error(
      `Garage background image not found at ${GARAGE_BACKGROUND_PATH}. Please add your garage image.`
    );
  }

  // Determine garage image mime type
  const ext = path.extname(GARAGE_BACKGROUND_PATH).toLowerCase();
  const garageMimeType = ext === ".png" ? "image/png" : "image/jpeg";

  // Initialize Gemini 3.1 Flash Image
  console.log("   🤖 Initializing Gemini 3.1 Flash Image model...");
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  // Create the compositing prompt
  const prompt = `You are an expert photo compositor.
Take this car image (with transparent background) and place it realistically into this garage/showroom scene.
The garage background already has the company branding on the walls - preserve it.

Requirements:
- Position the car naturally in the center of the garage floor
- Add realistic shadows under the car matching the garage lighting
- Adjust the car's lighting to match the ambient light in the garage
- Add subtle floor reflections if the floor is reflective
- Make sure the car looks like it naturally belongs in the scene
- Maintain the car's original proportions and details
- Keep the existing company branding/logos on the walls visible

Output a high-quality photorealistic composite image.`;

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
          imageSize: "1K",
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


