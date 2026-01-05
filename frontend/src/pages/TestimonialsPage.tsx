import { ContactSection } from "../components/home/ContactSection";
import { TestimonialsSection } from "../components/home/TestimonialsSection";
import { useHomeContent } from "../hooks/useHomeContent";

export function TestimonialsPage() {
  const { testimonials } = useHomeContent();

  return (
    <>
      <TestimonialsSection testimonials={testimonials.data} isLoading={testimonials.isLoading} />
      <ContactSection />
    </>
  );
}