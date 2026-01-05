import { ContactSection } from "../components/home/ContactSection";
import { PartyPackages } from "../components/home/PartyPackages";
import { TestimonialsSection } from "../components/home/TestimonialsSection";
import { useHomeContent } from "../hooks/useHomeContent";

export function PartiesPage() {
  const { packages, testimonials } = useHomeContent();

  return (
    <>
      <PartyPackages packages={packages.data} isLoading={packages.isLoading} />
      <TestimonialsSection testimonials={testimonials.data} isLoading={testimonials.isLoading} />
      <ContactSection />
    </>
  );
}