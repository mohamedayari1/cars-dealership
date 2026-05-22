"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Loader2, X, Upload, Wand2 } from "lucide-react";
import { useDropzone } from "react-dropzone";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { addCar } from "@/actions/cars";
import { removeImageBackground, processInteriorImage, validateCarImages } from "@/actions/image-processing";
import useFetch from "@/hooks/use-fetch";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Car, LayoutGrid } from "lucide-react";

// Predefined options
const fuelTypes = ["Petrol", "Diesel", "Electric", "Hybrid", "Plug-in Hybrid"];
const transmissions = ["Automatic", "Manual", "Semi-Automatic"];
const bodyTypes = [
  "SUV",
  "Sedan",
  "Hatchback",
  "Convertible",
  "Coupe",
  "Wagon",
  "Pickup",
];
const carStatuses = ["AVAILABLE", "UNAVAILABLE", "SOLD"];

// Define form schema with Zod
const carFormSchema = z.object({
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.string().refine((val) => {
    const year = parseInt(val);
    return !isNaN(year) && year >= 1900 && year <= new Date().getFullYear() + 1;
  }, "Valid year required"),
  price: z.string().min(1, "Price is required"),
  mileage: z.string().min(1, "Mileage is required"),
  color: z.string().min(1, "Color is required"),
  fuelType: z.string().min(1, "Fuel type is required"),
  transmission: z.string().min(1, "Transmission is required"),
  bodyType: z.string().min(1, "Body type is required"),
  seats: z.string().optional(),
  description: z.string().min(10, "Description must be at least 10 characters"),
  status: z.enum(["AVAILABLE", "UNAVAILABLE", "SOLD"]),
  featured: z.boolean().default(false),
});

export const AddCarForm = () => {
  const router = useRouter();
  // Separate state for exterior and interior images
  const [exteriorImages, setExteriorImages] = useState([]);
  const [interiorImages, setInteriorImages] = useState([]);
  const [exteriorUploadProgress, setExteriorUploadProgress] = useState(0);
  const [interiorUploadProgress, setInteriorUploadProgress] = useState(0);
  const [imageError, setImageError] = useState("");
  const [processingImage, setProcessingImage] = useState({ type: null, index: null });
  const [angleValidation, setAngleValidation] = useState(null);
  const [isValidatingAngles, setIsValidatingAngles] = useState(false);

  // Max images per type
  const MAX_EXTERIOR_IMAGES = 3;
  const MAX_INTERIOR_IMAGES = 2;

  // Initialize form with react-hook-form and zod
  const {
    register,
    setValue,
    getValues,
    formState: { errors },
    handleSubmit,
    watch,
  } = useForm({
    resolver: zodResolver(carFormSchema),
    defaultValues: {
      make: "",
      model: "",
      year: "",
      price: "",
      mileage: "",
      color: "",
      fuelType: "",
      transmission: "",
      bodyType: "",
      seats: "",
      description: "",
      status: "AVAILABLE",
      featured: false,
    },
  });

  // Custom hooks for API calls
  const {
    loading: addCarLoading,
    fn: addCarFn,
    data: addCarResult,
  } = useFetch(addCar);

  // Handle successful car addition
  useEffect(() => {
    if (addCarResult?.success) {
      toast.success("Car added successfully");
      router.push("/admin/cars");
    }
  }, [addCarResult, router]);

  // Handle exterior image uploads
  const onExteriorImagesDrop = useCallback((acceptedFiles) => {
    const remainingSlots = MAX_EXTERIOR_IMAGES - exteriorImages.length;
    if (remainingSlots <= 0) {
      toast.error(`Maximum ${MAX_EXTERIOR_IMAGES} exterior images allowed`);
      return;
    }

    const validFiles = acceptedFiles.slice(0, remainingSlots).filter((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 5MB limit and will be skipped`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setExteriorUploadProgress(progress);

      if (progress >= 100) {
        clearInterval(interval);

        const newImages = [];
        validFiles.forEach((file) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            newImages.push(e.target.result);

            if (newImages.length === validFiles.length) {
              const allExterior = [...exteriorImages, ...newImages];
              setExteriorImages(allExterior);
              setExteriorUploadProgress(0);
              setImageError("");
              toast.success(`Uploaded ${validFiles.length} exterior image(s)`);
              handleValidateAngles(allExterior);
            }
          };
          reader.readAsDataURL(file);
        });
      }
    }, 200);
  }, [exteriorImages]);

  // Handle interior image uploads
  const onInteriorImagesDrop = useCallback((acceptedFiles) => {
    const remainingSlots = MAX_INTERIOR_IMAGES - interiorImages.length;
    if (remainingSlots <= 0) {
      toast.error(`Maximum ${MAX_INTERIOR_IMAGES} interior images allowed`);
      return;
    }

    const validFiles = acceptedFiles.slice(0, remainingSlots).filter((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 5MB limit and will be skipped`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setInteriorUploadProgress(progress);

      if (progress >= 100) {
        clearInterval(interval);

        const newImages = [];
        validFiles.forEach((file) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            newImages.push(e.target.result);

            if (newImages.length === validFiles.length) {
              setInteriorImages((prev) => [...prev, ...newImages]);
              setInteriorUploadProgress(0);
              toast.success(`Uploaded ${validFiles.length} interior image(s)`);
            }
          };
          reader.readAsDataURL(file);
        });
      }
    }, 200);
  }, [interiorImages]);

  // Exterior dropzone
  const {
    getRootProps: getExteriorRootProps,
    getInputProps: getExteriorInputProps,
  } = useDropzone({
    onDrop: onExteriorImagesDrop,
    accept: { "image/*": [".jpeg", ".jpg", ".png", ".webp"] },
    multiple: true,
    disabled: exteriorImages.length >= MAX_EXTERIOR_IMAGES,
  });

  // Interior dropzone
  const {
    getRootProps: getInteriorRootProps,
    getInputProps: getInteriorInputProps,
  } = useDropzone({
    onDrop: onInteriorImagesDrop,
    accept: { "image/*": [".jpeg", ".jpg", ".png", ".webp"] },
    multiple: true,
    disabled: interiorImages.length >= MAX_INTERIOR_IMAGES,
  });

  // Remove exterior image
  const removeExteriorImage = (index) => {
    setExteriorImages((prev) => prev.filter((_, i) => i !== index));
    if (angleValidation) {
      setAngleValidation((prev) => ({
        ...prev,
        imageResults: prev.imageResults.filter((_, i) => i !== index),
      }));
    }
  };

  // Remove interior image
  const removeInteriorImage = (index) => {
    setInteriorImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Validate car image angles (informational only, non-blocking)
  const handleValidateAngles = async (images) => {
    if (images.length === 0) return;

    setIsValidatingAngles(true);
    try {
      const result = await validateCarImages(images);
      setAngleValidation(result);
      // Just informational - no warnings for missing angles
    } catch (error) {
      console.error("Angle validation error:", error);
      // Silent fail - angle detection is optional
    } finally {
      setIsValidatingAngles(false);
    }
  };

  // Remove background from exterior image (hero shot pipeline)
  const handleRemoveBackground = async (index) => {
    setProcessingImage({ type: "exterior", index });
    try {
      const result = await removeImageBackground(exteriorImages[index]);

      if (result.success) {
        setExteriorImages((prev) => {
          const newImages = [...prev];
          newImages[index] = result.data;
          return newImages;
        });
        toast.success("Background removed and composited!");
      } else {
        toast.error(result.error || "Failed to remove background");
      }
    } catch (error) {
      toast.error("Failed to remove background");
    } finally {
      setProcessingImage({ type: null, index: null });
    }
  };

  // Process interior image (whiten windows)
  const handleWhitenWindows = async (index) => {
    setProcessingImage({ type: "interior", index });
    try {
      const result = await processInteriorImage(interiorImages[index]);

      if (result.success) {
        setInteriorImages((prev) => {
          const newImages = [...prev];
          newImages[index] = result.data;
          return newImages;
        });
        toast.success("Windows whitened successfully!");
      } else {
        toast.error(result.error || "Failed to process interior image");
      }
    } catch (error) {
      toast.error("Failed to process interior image");
    } finally {
      setProcessingImage({ type: null, index: null });
    }
  };

  const onSubmit = async (data) => {
    // Check if at least one exterior image is uploaded
    if (exteriorImages.length === 0) {
      setImageError("Please upload at least one exterior image");
      return;
    }

    // Prepare data for server action
    const carData = {
      ...data,
      year: parseInt(data.year),
      price: parseFloat(data.price),
      mileage: parseInt(data.mileage),
      seats: data.seats ? parseInt(data.seats) : null,
    };

    // Call the addCar function with typed images
    await addCarFn({
      carData,
      exteriorImages,
      interiorImages,
    });
  };

  return (
    <div className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle>Car Details</CardTitle>
          <CardDescription>
            Enter the details of the car you want to add.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Make */}
              <div className="space-y-2">
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  {...register("make")}
                  placeholder="e.g. Toyota"
                  className={errors.make ? "border-red-500" : ""}
                />
                {errors.make && (
                  <p className="text-xs text-red-500">
                    {errors.make.message}
                  </p>
                )}
              </div>

              {/* Model */}
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  {...register("model")}
                  placeholder="e.g. Camry"
                  className={errors.model ? "border-red-500" : ""}
                />
                {errors.model && (
                  <p className="text-xs text-red-500">
                    {errors.model.message}
                  </p>
                )}
              </div>

              {/* Year */}
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  {...register("year")}
                  placeholder="e.g. 2022"
                  className={errors.year ? "border-red-500" : ""}
                />
                {errors.year && (
                  <p className="text-xs text-red-500">
                    {errors.year.message}
                  </p>
                )}
              </div>

              {/* Price */}
              <div className="space-y-2">
                <Label htmlFor="price">Price ($)</Label>
                <Input
                  id="price"
                  {...register("price")}
                  placeholder="e.g. 25000"
                  className={errors.price ? "border-red-500" : ""}
                />
                {errors.price && (
                  <p className="text-xs text-red-500">
                    {errors.price.message}
                  </p>
                )}
              </div>

              {/* Mileage */}
              <div className="space-y-2">
                <Label htmlFor="mileage">Mileage</Label>
                <Input
                  id="mileage"
                  {...register("mileage")}
                  placeholder="e.g. 15000"
                  className={errors.mileage ? "border-red-500" : ""}
                />
                {errors.mileage && (
                  <p className="text-xs text-red-500">
                    {errors.mileage.message}
                  </p>
                )}
              </div>

              {/* Color */}
              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  {...register("color")}
                  placeholder="e.g. Blue"
                  className={errors.color ? "border-red-500" : ""}
                />
                {errors.color && (
                  <p className="text-xs text-red-500">
                    {errors.color.message}
                  </p>
                )}
              </div>

              {/* Fuel Type */}
              <div className="space-y-2">
                <Label htmlFor="fuelType">Fuel Type</Label>
                <Select
                  onValueChange={(value) => setValue("fuelType", value)}
                  defaultValue={getValues("fuelType")}
                >
                  <SelectTrigger
                    className={errors.fuelType ? "border-red-500" : ""}
                  >
                    <SelectValue placeholder="Select fuel type" />
                  </SelectTrigger>
                  <SelectContent>
                    {fuelTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.fuelType && (
                  <p className="text-xs text-red-500">
                    {errors.fuelType.message}
                  </p>
                )}
              </div>

              {/* Transmission */}
              <div className="space-y-2">
                <Label htmlFor="transmission">Transmission</Label>
                <Select
                  onValueChange={(value) => setValue("transmission", value)}
                  defaultValue={getValues("transmission")}
                >
                  <SelectTrigger
                    className={errors.transmission ? "border-red-500" : ""}
                  >
                    <SelectValue placeholder="Select transmission" />
                  </SelectTrigger>
                  <SelectContent>
                    {transmissions.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.transmission && (
                  <p className="text-xs text-red-500">
                    {errors.transmission.message}
                  </p>
                )}
              </div>

              {/* Body Type */}
              <div className="space-y-2">
                <Label htmlFor="bodyType">Body Type</Label>
                <Select
                  onValueChange={(value) => setValue("bodyType", value)}
                  defaultValue={getValues("bodyType")}
                >
                  <SelectTrigger
                    className={errors.bodyType ? "border-red-500" : ""}
                  >
                    <SelectValue placeholder="Select body type" />
                  </SelectTrigger>
                  <SelectContent>
                    {bodyTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.bodyType && (
                  <p className="text-xs text-red-500">
                    {errors.bodyType.message}
                  </p>
                )}
              </div>

              {/* Seats */}
              <div className="space-y-2">
                <Label htmlFor="seats">
                  Number of Seats{" "}
                  <span className="text-sm text-gray-500">(Optional)</span>
                </Label>
                <Input
                  id="seats"
                  {...register("seats")}
                  placeholder="e.g. 5"
                />
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  onValueChange={(value) => setValue("status", value)}
                  defaultValue={getValues("status")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {carStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.charAt(0) + status.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Enter detailed description of the car..."
                className={`min-h-32 ${
                  errors.description ? "border-red-500" : ""
                }`}
              />
              {errors.description && (
                <p className="text-xs text-red-500">
                  {errors.description.message}
                </p>
              )}
            </div>

            {/* Featured */}
            <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
              <Checkbox
                id="featured"
                checked={watch("featured")}
                onCheckedChange={(checked) => {
                  setValue("featured", checked);
                }}
              />
              <div className="space-y-1 leading-none">
                <Label htmlFor="featured">Feature this car</Label>
                <p className="text-sm text-gray-500">
                  Featured cars appear on the homepage
                </p>
              </div>
            </div>

            {/* Image Upload Sections */}
            <div className="space-y-6">
              {imageError && (
                <p className="text-sm text-red-500">{imageError}</p>
              )}

              {/* EXTERIOR IMAGES SECTION */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Car className="h-5 w-5" />
                    Exterior Photos (Hero Shots)
                    <Badge variant="outline" className="ml-auto">
                      {exteriorImages.length}/{MAX_EXTERIOR_IMAGES}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Upload 1-3 exterior photos. Backgrounds will be removed and placed in a professional garage setting.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Exterior Dropzone */}
                  <div
                    {...getExteriorRootProps()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition ${
                      exteriorImages.length >= MAX_EXTERIOR_IMAGES
                        ? "border-gray-200 bg-gray-50 cursor-not-allowed"
                        : "border-gray-300"
                    }`}
                  >
                    <input {...getExteriorInputProps()} />
                    <div className="flex flex-col items-center justify-center">
                      <Upload className="h-10 w-10 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-600">
                        {exteriorImages.length >= MAX_EXTERIOR_IMAGES
                          ? "Maximum exterior images reached"
                          : "Drag & drop or click to upload exterior images"}
                      </span>
                      <span className="text-xs text-gray-500 mt-1">
                        (Front 3/4, Side, Rear views recommended)
                      </span>
                    </div>
                  </div>

                  {/* Exterior Upload Progress */}
                  {exteriorUploadProgress > 0 && (
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full"
                        style={{ width: `${exteriorUploadProgress}%` }}
                      ></div>
                    </div>
                  )}

                  {/* Angle Detection Summary (informational only) */}
                  {(angleValidation || isValidatingAngles) && (
                    <div className="mt-4">
                      {isValidatingAngles ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Detecting camera angles...
                        </div>
                      ) : angleValidation?.detectedAngles?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {angleValidation.detectedAngles
                            .filter((a) => a !== "interior" && a !== "unknown")
                            .map((angle) => (
                              <Badge key={angle} variant="secondary" className="text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {angle}
                              </Badge>
                            ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Exterior Image Previews */}
                  {exteriorImages.length > 0 && (
                    <div className="mt-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {exteriorImages.map((image, index) => {
                          const imageResult = angleValidation?.imageResults?.find(
                            (r) => r.index === index
                          );
                          const detectedAngle = imageResult?.validation?.angle;
                          const confidence = imageResult?.validation?.confidence;
                          const isProcessing =
                            processingImage.type === "exterior" && processingImage.index === index;

                          return (
                            <div key={index} className="relative group">
                              <Image
                                src={image}
                                alt={`Exterior ${index + 1}`}
                                height={50}
                                width={50}
                                className="h-32 w-full object-cover rounded-md"
                                priority
                              />
                              {/* Angle badge */}
                              {detectedAngle && detectedAngle !== "unknown" && (
                                <Badge
                                  variant="secondary"
                                  className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 bg-black/70 text-white"
                                >
                                  {detectedAngle}
                                  {confidence && ` (${Math.round(confidence * 100)}%)`}
                                </Badge>
                              )}
                              {/* Remove button */}
                              <Button
                                type="button"
                                size="icon"
                                variant="destructive"
                                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => removeExteriorImage(index)}
                                disabled={isProcessing}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                              {/* Remove Background button */}
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="absolute bottom-1 left-1 right-1 h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleRemoveBackground(index)}
                                disabled={processingImage.type !== null}
                              >
                                {isProcessing ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <Wand2 className="h-3 w-3 mr-1" />
                                    Remove BG
                                  </>
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* INTERIOR IMAGES SECTION */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <LayoutGrid className="h-5 w-5" />
                    Interior Photos
                    <Badge variant="outline" className="ml-auto">
                      {interiorImages.length}/{MAX_INTERIOR_IMAGES}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Upload 1-2 interior photos. Windows will be automatically whitened for privacy.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Interior Dropzone */}
                  <div
                    {...getInteriorRootProps()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50 transition ${
                      interiorImages.length >= MAX_INTERIOR_IMAGES
                        ? "border-gray-200 bg-gray-50 cursor-not-allowed"
                        : "border-gray-300"
                    }`}
                  >
                    <input {...getInteriorInputProps()} />
                    <div className="flex flex-col items-center justify-center">
                      <Upload className="h-10 w-10 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-600">
                        {interiorImages.length >= MAX_INTERIOR_IMAGES
                          ? "Maximum interior images reached"
                          : "Drag & drop or click to upload interior images"}
                      </span>
                      <span className="text-xs text-gray-500 mt-1">
                        (Dashboard, seats, cabin views)
                      </span>
                    </div>
                  </div>

                  {/* Interior Upload Progress */}
                  {interiorUploadProgress > 0 && (
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                      <div
                        className="bg-green-600 h-2.5 rounded-full"
                        style={{ width: `${interiorUploadProgress}%` }}
                      ></div>
                    </div>
                  )}

                  {/* Interior Image Previews */}
                  {interiorImages.length > 0 && (
                    <div className="mt-4">
                      <div className="grid grid-cols-2 gap-4">
                        {interiorImages.map((image, index) => {
                          const isProcessing =
                            processingImage.type === "interior" && processingImage.index === index;

                          return (
                            <div key={index} className="relative group">
                              <Image
                                src={image}
                                alt={`Interior ${index + 1}`}
                                height={50}
                                width={50}
                                className="h-32 w-full object-cover rounded-md"
                                priority
                              />
                              {/* Remove button */}
                              <Button
                                type="button"
                                size="icon"
                                variant="destructive"
                                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => removeInteriorImage(index)}
                                disabled={isProcessing}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                              {/* Whiten Windows button */}
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="absolute bottom-1 left-1 right-1 h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleWhitenWindows(index)}
                                disabled={processingImage.type !== null}
                              >
                                {isProcessing ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <Wand2 className="h-3 w-3 mr-1" />
                                    Whiten Windows
                                  </>
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Button
              type="submit"
              className="w-full md:w-auto"
              disabled={addCarLoading}
            >
              {addCarLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding Car...
                </>
              ) : (
                "Add Car"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
