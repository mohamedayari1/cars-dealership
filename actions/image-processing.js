"use server";

import fs from "fs/promises";
import path from "path";

/**
 * Remove background from car image using Remove.bg API
 * and add white background with company logo watermark
 */
export async function removeImageBackground(imageBase64) {
  try {
    const apiKey = process.env.REMOVEBG_API_KEY;

    if (!apiKey) {
      throw new Error("REMOVEBG_API_KEY is not configured");
    }

    // Extract base64 data (remove data:image/xxx;base64, prefix)
    const base64Data = imageBase64.includes(",")
      ? imageBase64.split(",")[1]
      : imageBase64;

    // Call Remove.bg API
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

    // Get the processed image as buffer
    const processedImageBuffer = await response.arrayBuffer();
    const processedBase64 = Buffer.from(processedImageBuffer).toString("base64");

    // Add logo watermark
    const finalImage = await addLogoWatermark(processedBase64);

    return {
      success: true,
      data: `data:image/png;base64,${finalImage}`,
    };
  } catch (error) {
    console.error("Background removal error:", error);
    return {
      success: false,
      error: error.message || "Failed to remove background",
    };
  }
}

/**
 * Add company logo watermark to the image
 * This is a simple implementation - for production you might want to use sharp or canvas
 */
async function addLogoWatermark(imageBase64) {
  // For now, return the image as-is with white background (already added by Remove.bg)
  // The logo watermark would require an image processing library like 'sharp'
  //
  // To add actual logo overlay, you would need to:
  // 1. Install sharp: bun add sharp
  // 2. Use sharp to composite the logo onto the image
  //
  // For now, we return the white-background image directly
  return imageBase64;
}

/**
 * Advanced version with sharp (uncomment and install sharp to use)
 * bun add sharp
 */
/*
import sharp from "sharp";

async function addLogoWatermarkWithSharp(imageBase64) {
  const imageBuffer = Buffer.from(imageBase64, "base64");

  // Read the logo
  const logoPath = path.join(process.cwd(), "public", "logo.png");
  const logoBuffer = await fs.readFile(logoPath);

  // Get image dimensions
  const metadata = await sharp(imageBuffer).metadata();

  // Resize logo to be 20% of image width
  const logoWidth = Math.round(metadata.width * 0.2);
  const resizedLogo = await sharp(logoBuffer)
    .resize(logoWidth)
    .toBuffer();

  // Composite logo onto bottom-right corner
  const result = await sharp(imageBuffer)
    .composite([{
      input: resizedLogo,
      gravity: "southeast",
      blend: "over",
    }])
    .png()
    .toBuffer();

  return result.toString("base64");
}
*/
