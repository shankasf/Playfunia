import { useState, useRef, useEffect } from "react";
import styles from "./LazyImage.module.css";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  aspectRatio?: string;
  placeholderColor?: string;
}

export function LazyImage({
  src,
  alt,
  className = "",
  aspectRatio = "16/9",
  placeholderColor = "#e0e0e0",
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "100px",
        threshold: 0.1,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={imgRef}
      className={`${styles.wrapper} ${className}`}
      style={{
        aspectRatio,
        backgroundColor: placeholderColor,
      }}
    >
      {isInView && (
        <>
          <img
            src={src}
            alt={alt}
            className={`${styles.image} ${isLoaded ? styles.loaded : ""}`}
            onLoad={() => setIsLoaded(true)}
            loading="lazy"
            decoding="async"
          />
          {!isLoaded && <div className={styles.shimmer} />}
        </>
      )}
    </div>
  );
}
