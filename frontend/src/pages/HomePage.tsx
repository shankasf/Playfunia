import { AnnouncementsBanner } from "../components/home/AnnouncementsBanner";
import { BirthdayPartyShowcase } from "../components/home/BirthdayPartyShowcase";
import { ExperienceHighlights } from "../components/home/ExperienceHighlights";
import { FacilityShowcase } from "../components/home/FacilityShowcase";
import { HeroSection } from "../components/home/HeroSection";
import { InstagramFeed } from "../components/home/InstagramFeed";
import { PlayZonesShowcase } from "../components/home/PlayZonesShowcase";
import { TestimonialsSection } from "../components/home/TestimonialsSection";
import { VideoGallery } from "../components/home/VideoGallery";
import { useHomeContent } from "../hooks/useHomeContent";

export function HomePage() {
  const { announcements, testimonials } = useHomeContent();

  return (
    <>
      <HeroSection />
      <AnnouncementsBanner announcements={announcements.data} isLoading={announcements.isLoading} />
      <FacilityShowcase />
      <PlayZonesShowcase />
      <VideoGallery />
      <BirthdayPartyShowcase />
      <ExperienceHighlights />
      <InstagramFeed />
      <TestimonialsSection
        testimonials={testimonials.data.slice(0, 3)}
        isLoading={testimonials.isLoading}
      />
    </>
  );
}