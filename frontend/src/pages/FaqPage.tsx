import { ContactSection } from "../components/home/ContactSection";
import { FaqSection } from "../components/home/FaqSection";
import { useHomeContent } from "../hooks/useHomeContent";

export function FaqPage() {
  const { faqs } = useHomeContent();

  return (
    <>
      <FaqSection items={faqs.data} isLoading={faqs.isLoading} />
      <ContactSection />
    </>
  );
}