#!/usr/bin/env node
/**
 * Image Optimization Script for Playfunia
 *
 * Generates responsive images in WebP, AVIF, and JPEG formats at multiple sizes.
 * This dramatically reduces page load time by serving appropriately sized images.
 *
 * Usage:
 *   npm run optimize:images
 *
 * Output:
 *   public/images/optimized/
 *     ├── hero/
 *     │   ├── hero-ballpit-logo-400w.avif
 *     │   ├── hero-ballpit-logo-400w.webp
 *     │   ├── hero-ballpit-logo-400w.jpg
 *     │   └── ... (more sizes)
 *     ├── playground/
 *     │   └── ...
 *     └── ...
 */

import sharp from "sharp";
import { glob } from "glob";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const INPUT_DIR = path.join(PUBLIC_DIR, "images");
const OUTPUT_DIR = path.join(PUBLIC_DIR, "images", "optimized");

// Image size presets
const SIZE_PRESETS = {
  hero: [2400, 1600, 1200, 800, 600, 400],
  card: [800, 600, 400],
  thumbnail: [400, 300, 200],
  gallery: [800, 600, 400],
};

// Quality settings for each format
const QUALITY = {
  avif: 50, // AVIF is very efficient, lower quality still looks great
  webp: 75,
  jpeg: 80,
};

// Map images to their categories and output paths
const IMAGE_MAPPINGS = [
  // Hero images
  {
    input: "hero-ballpit-logo.jpg",
    output: "hero/hero-ballpit-logo",
    sizes: SIZE_PRESETS.hero,
  },
  {
    input: "playground-overview.jpg",
    output: "hero/playground-overview",
    sizes: SIZE_PRESETS.hero,
  },
  {
    input: "playfunia-illustration.jpg",
    output: "hero/playfunia-illustration",
    sizes: SIZE_PRESETS.hero,
  },

  // Party images
  {
    input: "playground/party/party-cake.jpg",
    output: "party/party-cake",
    sizes: SIZE_PRESETS.card,
  },
  {
    input: "playground/party/party-balloons.jpg",
    output: "party/party-balloons",
    sizes: SIZE_PRESETS.card,
  },
  {
    input: "playground/party/party-celebration.jpg",
    output: "party/party-celebration",
    sizes: SIZE_PRESETS.card,
  },

  // Facility images
  {
    input: "playground/facility/slides-overview.jpg",
    output: "facility/slides-overview",
    sizes: SIZE_PRESETS.card,
  },
  {
    input: "playground/facility/ball-pit-wheel.jpg",
    output: "facility/ball-pit-wheel",
    sizes: SIZE_PRESETS.card,
  },
  {
    input: "playground/facility/play-area.jpg",
    output: "facility/play-area",
    sizes: SIZE_PRESETS.card,
  },
  {
    input: "playground/facility/animal-seats.jpg",
    output: "facility/animal-seats",
    sizes: SIZE_PRESETS.card,
  },
  {
    input: "playground/facility/hanging-obstacles.jpg",
    output: "facility/hanging-obstacles",
    sizes: SIZE_PRESETS.card,
  },
  {
    input: "playground/facility/soft-play.jpg",
    output: "facility/soft-play",
    sizes: SIZE_PRESETS.card,
  },

  // Kids/Play zones images
  {
    input: "playground/kids/ball-pit-neon.jpg",
    output: "kids/ball-pit-neon",
    sizes: SIZE_PRESETS.card,
  },
  {
    input: "playground/kids/tube-slide.jpg",
    output: "kids/tube-slide",
    sizes: SIZE_PRESETS.card,
  },
  {
    input: "playground/kids/climbing-stairs.jpg",
    output: "kids/climbing-stairs",
    sizes: SIZE_PRESETS.card,
  },
  {
    input: "playground/kids/rocking-horse.jpg",
    output: "kids/rocking-horse",
    sizes: SIZE_PRESETS.card,
  },

  // Gallery images
  {
    input: "playground/kids/ball-pit-red-ball.jpg",
    output: "kids/ball-pit-red-ball",
    sizes: SIZE_PRESETS.gallery,
  },
  {
    input: "playground/kids/swing-bridge.jpg",
    output: "kids/swing-bridge",
    sizes: SIZE_PRESETS.gallery,
  },
  {
    input: "playground/kids/hanging-platforms.jpg",
    output: "kids/hanging-platforms",
    sizes: SIZE_PRESETS.gallery,
  },
  {
    input: "playground/kids/playhouse-window.jpg",
    output: "kids/playhouse-window",
    sizes: SIZE_PRESETS.gallery,
  },
  {
    input: "playground/kids/colorful-balls.jpg",
    output: "kids/colorful-balls",
    sizes: SIZE_PRESETS.gallery,
  },
  {
    input: "playground/kids/horse-seats.jpg",
    output: "kids/horse-seats",
    sizes: SIZE_PRESETS.gallery,
  },
];

/**
 * Ensures a directory exists, creating it if necessary
 */
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

/**
 * Gets the size of a file in bytes
 */
async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Formats bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Processes a single image into multiple formats and sizes
 */
async function processImage(mapping) {
  const inputPath = path.join(INPUT_DIR, mapping.input);

  // Check if input file exists
  try {
    await fs.access(inputPath);
  } catch {
    console.warn(`⚠️  Skipping: ${mapping.input} (file not found)`);
    return { input: mapping.input, skipped: true };
  }

  const originalSize = await getFileSize(inputPath);
  console.log(`\n📷 Processing: ${mapping.input} (${formatBytes(originalSize)})`);

  const results = [];

  // Load the image once
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  for (const width of mapping.sizes) {
    // Skip sizes larger than the original
    if (metadata.width && width > metadata.width) {
      continue;
    }

    const outputBasePath = path.join(OUTPUT_DIR, mapping.output);
    await ensureDir(path.dirname(outputBasePath));

    // Calculate height maintaining aspect ratio
    const height = metadata.height
      ? Math.round((width / metadata.width) * metadata.height)
      : undefined;

    // Generate each format
    const formats = [
      { ext: "avif", options: { quality: QUALITY.avif } },
      { ext: "webp", options: { quality: QUALITY.webp } },
      { ext: "jpg", options: { quality: QUALITY.jpeg, mozjpeg: true } },
    ];

    for (const format of formats) {
      const outputPath = `${outputBasePath}-${width}w.${format.ext}`;

      try {
        const pipeline = sharp(inputPath).resize(width, height, {
          fit: "cover",
          withoutEnlargement: true,
        });

        if (format.ext === "avif") {
          await pipeline.avif(format.options).toFile(outputPath);
        } else if (format.ext === "webp") {
          await pipeline.webp(format.options).toFile(outputPath);
        } else {
          await pipeline.jpeg(format.options).toFile(outputPath);
        }

        const outputSize = await getFileSize(outputPath);
        results.push({
          path: outputPath.replace(PUBLIC_DIR, ""),
          size: outputSize,
        });

        console.log(`   ✓ ${width}w.${format.ext}: ${formatBytes(outputSize)}`);
      } catch (err) {
        console.error(`   ✗ ${width}w.${format.ext}: ${err.message}`);
      }
    }
  }

  return {
    input: mapping.input,
    originalSize,
    outputs: results,
  };
}

/**
 * Main function
 */
async function main() {
  console.log("🎨 Playfunia Image Optimization");
  console.log("================================\n");

  // Clean output directory
  console.log("🧹 Cleaning output directory...");
  try {
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  } catch {
    // Directory might not exist
  }
  await ensureDir(OUTPUT_DIR);

  // Process all images
  const results = [];
  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;

  for (const mapping of IMAGE_MAPPINGS) {
    const result = await processImage(mapping);
    if (!result.skipped) {
      results.push(result);
      totalOriginalSize += result.originalSize;
      totalOptimizedSize += result.outputs.reduce((sum, o) => sum + o.size, 0);
    }
  }

  // Summary
  console.log("\n================================");
  console.log("📊 Optimization Summary");
  console.log("================================");
  console.log(`Images processed: ${results.length}`);
  console.log(`Original total:   ${formatBytes(totalOriginalSize)}`);
  console.log(`Optimized total:  ${formatBytes(totalOptimizedSize)}`);
  console.log(
    `Space saved:      ${formatBytes(totalOriginalSize - totalOptimizedSize)} (${Math.round((1 - totalOptimizedSize / totalOriginalSize) * 100)}%)`
  );
  console.log(`Output directory: ${OUTPUT_DIR.replace(PUBLIC_DIR, "public")}`);

  // Generate manifest for easy importing
  const manifest = {
    generated: new Date().toISOString(),
    images: results.map((r) => ({
      original: r.input,
      basePath: `/images/optimized/${IMAGE_MAPPINGS.find((m) => m.input === r.input)?.output}`,
      sizes: IMAGE_MAPPINGS.find((m) => m.input === r.input)?.sizes || [],
      formats: ["avif", "webp", "jpg"],
    })),
  };

  await fs.writeFile(
    path.join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log("\n✅ Generated manifest.json");
  console.log("\n🎉 Optimization complete!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
