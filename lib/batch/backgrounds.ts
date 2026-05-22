import fs from "fs/promises";
import path from "path";

// Configuration
const GARAGE_BACKGROUNDS_DIR =
  process.env.GARAGE_BACKGROUNDS_DIR || "public/assets";
const GARAGE_BACKGROUND_PATTERN = /^garage-background.*\.(png|jpg|jpeg)$/i;

export interface GarageBackground {
  name: string;
  path: string;
  base64: string;
  mimeType: string;
}

/**
 * Load all available garage backgrounds from the assets directory
 */
export async function loadGarageBackgrounds(): Promise<GarageBackground[]> {
  const backgroundsDir = path.join(process.cwd(), GARAGE_BACKGROUNDS_DIR);

  let files: string[];
  try {
    files = await fs.readdir(backgroundsDir);
  } catch (error) {
    console.error(
      `[BATCH] Failed to read backgrounds directory: ${backgroundsDir}`
    );
    throw new Error(
      `No garage backgrounds directory found at ${GARAGE_BACKGROUNDS_DIR}`
    );
  }

  const backgrounds: GarageBackground[] = [];

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

  if (backgrounds.length === 0) {
    throw new Error(
      `No garage backgrounds found in ${GARAGE_BACKGROUNDS_DIR}. Please add images matching pattern: garage-background*.png/jpg`
    );
  }

  console.log(
    `[BATCH] Loaded ${backgrounds.length} garage backgrounds: ${backgrounds.map((b) => b.name).join(", ")}`
  );

  return backgrounds;
}

/**
 * Select the best background for a car image
 * For batch processing, we use a simpler selection without calling Gemini
 * to avoid additional API calls. Uses round-robin or random selection.
 */
export async function selectBestBackground(
  _carImageBase64: string,
  backgrounds: GarageBackground[],
  index?: number
): Promise<GarageBackground> {
  if (backgrounds.length === 0) {
    throw new Error("No backgrounds available");
  }

  if (backgrounds.length === 1) {
    return backgrounds[0];
  }

  // For batch processing, use round-robin based on index
  // This ensures variety without additional API calls
  if (index !== undefined) {
    return backgrounds[index % backgrounds.length];
  }

  // Otherwise, return the first background (default)
  return backgrounds[0];
}

/**
 * Get a specific background by name
 */
export async function getBackgroundByName(
  name: string
): Promise<GarageBackground | null> {
  const backgrounds = await loadGarageBackgrounds();
  return backgrounds.find((bg) => bg.name === name) || null;
}

/**
 * Get background options for UI selection
 */
export async function getBackgroundOptions(): Promise<
  Array<{ name: string; preview: string }>
> {
  const backgrounds = await loadGarageBackgrounds();

  return backgrounds.map((bg) => ({
    name: bg.name,
    preview: `data:${bg.mimeType};base64,${bg.base64.slice(0, 1000)}...`, // Truncated preview
  }));
}
