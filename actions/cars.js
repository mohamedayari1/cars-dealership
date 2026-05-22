"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { serializeCarData } from "@/lib/helpers";
import fs from "fs/promises";
import path from "path";

// Function to convert File to base64
async function fileToBase64(file) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  return buffer.toString("base64");
}

// Gemini AI integration for car image processing
export async function processCarImageWithAI(file) {
  try {
    // Check if API key is available
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Gemini API key is not configured");
    }

    // Initialize Gemini API
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Convert image file to base64
    const base64Image = await fileToBase64(file);

    // Create image part for the model
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: file.type,
      },
    };

    // Define the prompt for car detail extraction
    const prompt = `
      Analyze this car image and extract the following information:
      1. Make (manufacturer)
      2. Model
      3. Year (approximately)
      4. Color
      5. Body type (SUV, Sedan, Hatchback, etc.)
      6. Mileage
      7. Fuel type (your best guess)
      8. Transmission type (your best guess)
      9. Price (your best guess)
      9. Short Description as to be added to a car listing

      Format your response as a clean JSON object with these fields:
      {
        "make": "",
        "model": "",
        "year": 0000,
        "color": "",
        "price": "",
        "mileage": "",
        "bodyType": "",
        "fuelType": "",
        "transmission": "",
        "description": "",
        "confidence": 0.0
      }

      For confidence, provide a value between 0 and 1 representing how confident you are in your overall identification.
      Only respond with the JSON object, nothing else.
    `;

    // Get response from Gemini
    const result = await model.generateContent([imagePart, prompt]);
    const response = await result.response;
    const text = response.text();
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();

    // Parse the JSON response
    try {
      const carDetails = JSON.parse(cleanedText);

      // Validate the response format
      const requiredFields = [
        "make",
        "model",
        "year",
        "color",
        "bodyType",
        "price",
        "mileage",
        "fuelType",
        "transmission",
        "description",
        "confidence",
      ];

      const missingFields = requiredFields.filter(
        (field) => !(field in carDetails)
      );

      if (missingFields.length > 0) {
        throw new Error(
          `AI response missing required fields: ${missingFields.join(", ")}`
        );
      }

      // Return success response with data
      return {
        success: true,
        data: carDetails,
      };
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.log("Raw response:", text);
      return {
        success: false,
        error: "Failed to parse AI response",
      };
    }
  } catch (error) {
    console.error();
    throw new Error("Gemini API error:" + error.message);
  }
}

/**
 * Helper function to save images to disk
 * @param {string[]} images - Array of base64 image data URLs
 * @param {string} uploadDir - Directory to save images
 * @param {string} carId - Car ID for URL path
 * @param {string} prefix - Filename prefix (e.g., "exterior", "interior")
 * @returns {Promise<string[]>} Array of public URLs
 */
async function saveImages(images, uploadDir, carId, prefix) {
  const urls = [];

  for (let i = 0; i < images.length; i++) {
    const base64Data = images[i];

    if (!base64Data || !base64Data.startsWith("data:image/")) {
      console.warn(`Skipping invalid ${prefix} image data`);
      continue;
    }

    const base64 = base64Data.split(",")[1];
    const imageBuffer = Buffer.from(base64, "base64");

    const mimeMatch = base64Data.match(/data:image\/([a-zA-Z0-9]+);/);
    const fileExtension = mimeMatch ? mimeMatch[1] : "jpeg";

    const fileName = `${prefix}-${Date.now()}-${i}.${fileExtension}`;
    const filePath = path.join(uploadDir, fileName);

    await fs.writeFile(filePath, imageBuffer);

    const publicUrl = `/uploads/cars/${carId}/${fileName}`;
    urls.push(publicUrl);
  }

  return urls;
}

// Add a car to the database with typed images (exterior/interior)
export async function addCar({ carData, exteriorImages = [], interiorImages = [] }) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await db.user.findUnique({
      where: { clerkUserId: userId },
    });

    if (!user) throw new Error("User not found");

    // Create a unique folder name for this car's images
    const carId = uuidv4();
    const uploadDir = path.join(process.cwd(), "public", "uploads", "cars", carId);

    // Create the directory
    await fs.mkdir(uploadDir, { recursive: true });

    // Save exterior and interior images with prefixes
    const exteriorUrls = await saveImages(exteriorImages, uploadDir, carId, "exterior");
    const interiorUrls = await saveImages(interiorImages, uploadDir, carId, "interior");

    // Combine all URLs for backward compatibility
    const allImageUrls = [...exteriorUrls, ...interiorUrls];

    if (allImageUrls.length === 0) {
      throw new Error("No valid images were uploaded");
    }

    // Add the car to the database (without CarImage relation for now)
    // TODO: After running `npx prisma migrate dev --name add-car-image-model`,
    // you can enable the carImages relation by uncommenting below
    const car = await db.car.create({
      data: {
        id: carId,
        make: carData.make,
        model: carData.model,
        year: carData.year,
        price: carData.price,
        mileage: carData.mileage,
        color: carData.color,
        fuelType: carData.fuelType,
        transmission: carData.transmission,
        bodyType: carData.bodyType,
        seats: carData.seats,
        description: carData.description,
        status: carData.status,
        featured: carData.featured,
        images: allImageUrls,
        // Uncomment after migration:
        // carImages: {
        //   create: [
        //     ...exteriorUrls.map((url, i) => ({ url, type: "EXTERIOR", sortOrder: i })),
        //     ...interiorUrls.map((url, i) => ({ url, type: "INTERIOR", sortOrder: exteriorUrls.length + i })),
        //   ],
        // },
      },
    });

    // Revalidate the cars list page
    revalidatePath("/admin/cars");

    return {
      success: true,
    };
  } catch (error) {
    throw new Error("Error adding car:" + error.message);
  }
}

// Fetch all cars with simple search
export async function getCars(search = "") {
  try {
    // Build where conditions
    let where = {};

    // Add search filter
    if (search) {
      where.OR = [
        { make: { contains: search, mode: "insensitive" } },
        { model: { contains: search, mode: "insensitive" } },
        { color: { contains: search, mode: "insensitive" } },
      ];
    }

    // Execute main query
    const cars = await db.car.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const serializedCars = cars.map(serializeCarData);

    return {
      success: true,
      data: serializedCars,
    };
  } catch (error) {
    console.error("Error fetching cars:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Delete a car by ID
export async function deleteCar(id) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    // First, fetch the car to get its images
    const car = await db.car.findUnique({
      where: { id },
      select: { images: true },
    });

    if (!car) {
      return {
        success: false,
        error: "Car not found",
      };
    }

    // Delete the car from the database
    await db.car.delete({
      where: { id },
    });

    // Delete the local image folder
    try {
      const carDir = path.join(process.cwd(), "public", "uploads", "cars", id);
      await fs.rm(carDir, { recursive: true, force: true });
    } catch (storageError) {
      console.error("Error deleting local images:", storageError);
      // Continue even if deletion fails
    }

    // Revalidate the cars list page
    revalidatePath("/admin/cars");

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error deleting car:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Update car status or featured status
export async function updateCarStatus(id, { status, featured }) {
  try {
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const updateData = {};

    if (status !== undefined) {
      updateData.status = status;
    }

    if (featured !== undefined) {
      updateData.featured = featured;
    }

    // Update the car
    await db.car.update({
      where: { id },
      data: updateData,
    });

    // Revalidate the cars list page
    revalidatePath("/admin/cars");

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error updating car status:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}
