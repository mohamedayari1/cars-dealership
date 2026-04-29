"use server";

import sharp from "sharp";

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
 * Add tiled company name watermark across the image
 * Creates a diagonal pattern with "AI Car Marketplace" repeated 6 times
 */
async function addLogoWatermark(imageBase64) {
  const imageBuffer = Buffer.from(imageBase64, "base64");

  // Get image dimensions
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;

  // Calculate font size relative to image width (about 5% of width)
  const fontSize = Math.round(width * 0.05);

  // Create positions for 6 watermarks (2 columns x 3 rows)
  const watermarks = [];
  const cols = 2;
  const rows = 3;
  const xSpacing = width / (cols + 1);
  const ySpacing = height / (rows + 1);

  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= cols; col++) {
      const x = xSpacing * col;
      const y = ySpacing * row;
      watermarks.push({ x, y });
    }
  }

  // Create SVG with all watermark text instances
  const textElements = watermarks
    .map(
      ({ x, y }) =>
        `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="rgba(100, 100, 100, 0.25)" text-anchor="middle" transform="rotate(-30, ${x}, ${y})">AI Car Marketplace</text>`
    )
    .join("\n");

  const svgWatermark = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${textElements}
    </svg>
  `;

  // Composite the watermark onto the image
  const result = await sharp(imageBuffer)
    .composite([
      {
        input: Buffer.from(svgWatermark),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  return result.toString("base64");
}

