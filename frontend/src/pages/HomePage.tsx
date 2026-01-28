import { lazy, Suspense } from "react";
import { AnnouncementsBanner } from "../components/home/AnnouncementsBanner";
import { FacilityShowcase } from "../components/home/FacilityShowcase";
import { HeroSection } from "../components/home/HeroSection";
import { PlayZonesShowcase } from "../components/home/PlayZonesShowcase";
import { useHomeContent } from "../hooks/useHomeContent";

// Lazy load below-fold sections for faster initial page load
const VideoGallery = lazy(() => import("../components/home/VideoGallery").then(m => ({ default: m.VideoGallery })));
const BirthdayPartyShowcase = lazy(() => import("../components/home/BirthdayPartyShowcase").then(m => ({ default: m.BirthdayPartyShowcase })));
const ExperienceHighlights = lazy(() => import("../components/home/ExperienceHighlights").then(m => ({ default: m.ExperienceHighlights })));
const InstagramFeed = lazy(() => import("../components/home/InstagramFeed").then(m => ({ default: m.InstagramFeed })));
const TestimonialsSection = lazy(() => import("../components/home/TestimonialsSection").then(m => ({ default: m.TestimonialsSection })));

// Simple loading placeholder for lazy sections
function SectionLoader() {
  return <div style={{ minHeight: '200px', background: '#fafafa' }} />;
}

export function HomePage() {
  const { announcements, testimonials } = useHomeContent();

  return (
    <>
      {/* Critical above-fold content - loaded immediately */}
      <HeroSection />
      <AnnouncementsBanner announcements={announcements.data} isLoading={announcements.isLoading} />
      <FacilityShowcase />
      <PlayZonesShowcase />

      {/* Below-fold content - lazy loaded for faster initial paint */}
      <Suspense fallback={<SectionLoader />}>
        <VideoGallery />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <BirthdayPartyShowcase />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <ExperienceHighlights />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <InstagramFeed />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <TestimonialsSection
          testimonials={testimonials.data.slice(0, 3)}
          isLoading={testimonials.isLoading}
        />
      </Suspense>
    </>
  );
}