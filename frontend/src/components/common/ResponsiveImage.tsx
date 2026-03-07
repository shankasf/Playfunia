import { useState, useRef, useEffect, memo } from "react";
import styles from "./ResponsiveImage.module.css";

interface ResponsiveImageProps {
  /** Base path without extension (e.g., "/images/optimized/hero/hero-ballpit-logo") */
  basePath: string;
  /** Alt text for the image */
  alt: string;
  /** Available widths for srcset (e.g., [400, 600, 800, 1200, 1600]) */
  widths: number[];
  /** Sizes attribute for responsive selection (e.g., "(max-width: 960px) 100vw, 55vw") */
  sizes: string;
  /** Additional CSS class */
  className?: string;
  /** Aspect ratio for the container (e.g., "16/9", "4/3") */
  aspectRatio?: string;
  /** Placeholder background color while loading */
  placeholderColor?: string;
  /** If true, loads eagerly (for LCP images above the fold) */
  priority?: boolean;
  /** Fallback to original image path if optimized versions don't exist */
  fallbackSrc?: string;
}

/**
 * ResponsiveImage component that serves AVIF, WebP, or JPEG based on browser support.
 * Uses srcset for responsive image selection and IntersectionObserver for lazy loading.
 *
 * @example
 * // Hero image (priority/LCP)
 * <ResponsiveImage
 *   basePath="/images/optimized/hero/hero-ballpit-logo"
 *   alt="Playfunia ball pit"
 *   widths={[400, 600, 800, 1200, 1600, 2400]}
 *   sizes="(max-width: 960px) 100vw, 55vw"
 *   priority={true}
 * />
 *
 * // Card image (lazy loaded)
 * <ResponsiveImage
 *   basePath="/images/optimized/facility/slides-overview"
 *   alt="Slides overview"
 *   widths={[400, 600, 800]}
 *   sizes="(max-width: 768px) 100vw, 33vw"
 *   aspectRatio="4/3"
 * />
 */
export const ResponsiveImage = memo(function ResponsiveImage({
  basePath,
  alt,
  widths,
  sizes,
  className = "",
  aspectRatio = "16/9",
  placeholderColor = "#e0e0e0",
  priority = false,
  fallbackSrc,
}: ResponsiveImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Set up IntersectionObserver for lazy loading (skip if priority)
  useEffect(() => {
    if (priority) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "200px", // Start loading before the image enters viewport
        threshold: 0.01,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [priority]);

  // Generate srcset string for a given format
  const generateSrcSet = (format: "avif" | "webp" | "jpg") => {
    return widths.map((w) => `${basePath}-${w}w.${format} ${w}w`).join(", ");
  };

  // Get the default src (smallest jpg as fallback)
  const defaultSrc = `${basePath}-${widths[0]}w.jpg`;

  // Handle image load error - fall back to original
  const handleError = () => {
    if (!hasError && fallbackSrc) {
      setHasError(true);
    }
  };

  const shouldRender = isInView || priority;

  return (
    <div
      ref={containerRef}
      className={`${styles.wrapper} ${className}`}
      style={{
        aspectRatio,
        backgroundColor: placeholderColor,
      }}
    >
      {shouldRender && (
        <>
          {hasError && fallbackSrc ? (
            // Fallback to original image
            <img
              src={fallbackSrc}
              alt={alt}
              className={`${styles.image} ${isLoaded ? styles.loaded : ""}`}
              onLoad={() => setIsLoaded(true)}
              loading={priority ? "eager" : "lazy"}
              decoding={priority ? "sync" : "async"}
              fetchPriority={priority ? "high" : "auto"}
            />
          ) : (
            // Optimized picture element with format fallbacks
            <picture>
              {/* AVIF - Best compression, newest format */}
              <source
                type="image/avif"
                srcSet={generateSrcSet("avif")}
                sizes={sizes}
              />
              {/* WebP - Good compression, wide support */}
              <source
                type="image/webp"
                srcSet={generateSrcSet("webp")}
                sizes={sizes}
              />
              {/* JPEG - Universal fallback */}
              <img
                src={defaultSrc}
                srcSet={generateSrcSet("jpg")}
                sizes={sizes}
                alt={alt}
                className={`${styles.image} ${isLoaded ? styles.loaded : ""}`}
                onLoad={() => setIsLoaded(true)}
                onError={handleError}
                loading={priority ? "eager" : "lazy"}
                decoding={priority ? "sync" : "async"}
                fetchPriority={priority ? "high" : "auto"}
              />
            </picture>
          )}
          {!isLoaded && <div className={styles.shimmer} />}
        </>
      )}
    </div>
  );
});
