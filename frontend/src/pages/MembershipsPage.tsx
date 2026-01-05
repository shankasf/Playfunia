import { ContactSection } from "../components/home/ContactSection";
import { MembershipShowcase } from "../components/home/MembershipShowcase";
import { TestimonialsSection } from "../components/home/TestimonialsSection";
import { useHomeContent } from "../hooks/useHomeContent";

export function MembershipsPage() {
  const { memberships, testimonials } = useHomeContent();

  return (
    <>
      <MembershipShowcase plans={memberships.data} isLoading={memberships.isLoading} />
      <TestimonialsSection testimonials={testimonials.data} isLoading={testimonials.isLoading} />
      <ContactSection />
    </>
  );
}