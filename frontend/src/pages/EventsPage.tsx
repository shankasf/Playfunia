import { ContactSection } from "../components/home/ContactSection";
import { MembershipShowcase } from "../components/home/MembershipShowcase";
import { EventsCalendar } from "../components/events/EventsCalendar";
import { PastEventsGallery } from "../components/events/PastEventsGallery";
import { useHomeContent } from "../hooks/useHomeContent";

export function EventsPage() {
  const { events, memberships } = useHomeContent();

  return (
    <>
      <EventsCalendar events={events.data} isLoading={events.isLoading} />
      <PastEventsGallery />
      <MembershipShowcase plans={memberships.data} isLoading={memberships.isLoading} />
      <ContactSection />
    </>
  );
}