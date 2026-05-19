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

CRITICAL SHADOW REQUIREMENTS:
1. CONTACT SHADOW: Add a dark, sharp shadow directly under the car where tires touch the floor (opacity ~70-80%)
2. AMBIENT OCCLUSION: Add soft, diffused shadows in the gap between car undercarriage and floor
3. CAST SHADOW: Add a softer, elongated shadow extending from the car based on the garage's light source direction
4. Shadow edges should be slightly blurred/feathered, not hard-cut

LIGHTING REQUIREMENTS:
- Match car's lighting to the garage ambient light
- Add subtle highlights on car body reflecting garage lights
- Ensure consistent light direction between car and environment

COMPOSITION:
- Position car naturally on the garage floor (not floating)
- Maintain car's original proportions
- Preserve company branding on walls
- Add subtle floor reflection if floor is glossy

Output a photorealistic composite where the car appears to genuinely exist in this space.`;

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


