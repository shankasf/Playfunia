import { lazy, Suspense } from "react";
import { HeroSection } from "../components/home/HeroSection";
import { WaveDivider } from "../components/common/WaveDivider";
import { WaiverCTA } from "../components/home/WaiverCTA";
import { FacilityShowcase } from "../components/home/FacilityShowcase";
import { PlayZonesShowcase } from "../components/home/PlayZonesShowcase";
import { useHomeContent } from "../hooks/useHomeContent";

// Lazy load below-fold sections for faster initial page load
const BirthdayPartyShowcase = lazy(() => import("../components/home/BirthdayPartyShowcase").then(m => ({ default: m.BirthdayPartyShowcase })));
const VideoGallery = lazy(() => import("../components/home/VideoGallery").then(m => ({ default: m.VideoGallery })));
const ExperienceHighlights = lazy(() => import("../components/home/ExperienceHighlights").then(m => ({ default: m.ExperienceHighlights })));
const TestimonialsSection = lazy(() => import("../components/home/TestimonialsSection").then(m => ({ default: m.TestimonialsSection })));
const InstagramFeed = lazy(() => import("../components/home/InstagramFeed").then(m => ({ default: m.InstagramFeed })));
const AnnouncementsBanner = lazy(() => import("../components/home/AnnouncementsBanner").then(m => ({ default: m.AnnouncementsBanner })));

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

      <WaveDivider color="yellow" />
      <WaiverCTA />

      <WaveDivider color="pink" />
      <FacilityShowcase />

      <WaveDivider color="purple" />
      <PlayZonesShowcase />

      {/* Below-fold content - lazy loaded for faster initial paint */}
      <WaveDivider color="pink" />
      <Suspense fallback={<SectionLoader />}>
        <BirthdayPartyShowcase />
      </Suspense>

      <WaveDivider color="yellow" />
      <Suspense fallback={<SectionLoader />}>
        <VideoGallery />
      </Suspense>

      <WaveDivider color="turquoise" />
      <Suspense fallback={<SectionLoader />}>
        <ExperienceHighlights />
      </Suspense>

      <WaveDivider color="pink" />
      <Suspense fallback={<SectionLoader />}>
        <TestimonialsSection
          testimonials={testimonials.data.slice(0, 3)}
          isLoading={testimonials.isLoading}
        />
      </Suspense>

      <WaveDivider color="purple" />
      <Suspense fallback={<SectionLoader />}>
        <InstagramFeed />
      </Suspense>

      <Suspense fallback={<SectionLoader />}>
        <AnnouncementsBanner announcements={announcements.data} isLoading={announcements.isLoading} />
      </Suspense>
    </>
  );
}
