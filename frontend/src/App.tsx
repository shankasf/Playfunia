import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/layout/Layout";
import { PageLoader } from "./components/common/PageLoader";

// Eager load HomePage for fastest initial render
import { HomePage } from "./pages/HomePage";

// Lazy load other pages for code splitting
const MembershipPage = lazy(() => import("./pages/MembershipPage").then(m => ({ default: m.MembershipPage })));
const PartiesPage = lazy(() => import("./pages/PartiesPage").then(m => ({ default: m.PartiesPage })));
const BookPartyPage = lazy(() => import("./pages/BookPartyPage").then(m => ({ default: m.BookPartyPage })));
const BuyTicketPage = lazy(() => import("./pages/BuyTicketPage").then(m => ({ default: m.BuyTicketPage })));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage").then(m => ({ default: m.CheckoutPage })));
const EventsPage = lazy(() => import("./pages/EventsPage").then(m => ({ default: m.EventsPage })));
const TestimonialsPage = lazy(() => import("./pages/TestimonialsPage").then(m => ({ default: m.TestimonialsPage })));
const FaqPage = lazy(() => import("./pages/FaqPage").then(m => ({ default: m.FaqPage })));
const ContactPage = lazy(() => import("./pages/ContactPage").then(m => ({ default: m.ContactPage })));
const WaiverPage = lazy(() => import("./pages/WaiverPage").then(m => ({ default: m.WaiverPage })));
const AccountPage = lazy(() => import("./pages/AccountPage").then(m => ({ default: m.AccountPage })));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage").then(m => ({ default: m.AdminDashboardPage })));

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route
          path="membership"
          element={
            <Suspense fallback={<PageLoader />}>
              <MembershipPage />
            </Suspense>
          }
        />
        <Route
          path="parties"
          element={
            <Suspense fallback={<PageLoader />}>
              <PartiesPage />
            </Suspense>
          }
        />
        <Route
          path="book-party"
          element={
            <Suspense fallback={<PageLoader />}>
              <BookPartyPage />
            </Suspense>
          }
        />
        <Route
          path="buy-ticket"
          element={
            <Suspense fallback={<PageLoader />}>
              <BuyTicketPage />
            </Suspense>
          }
        />
        <Route
          path="checkout"
          element={
            <Suspense fallback={<PageLoader />}>
              <CheckoutPage />
            </Suspense>
          }
        />
        <Route
          path="events"
          element={
            <Suspense fallback={<PageLoader />}>
              <EventsPage />
            </Suspense>
          }
        />
        <Route
          path="testimonials"
          element={
            <Suspense fallback={<PageLoader />}>
              <TestimonialsPage />
            </Suspense>
          }
        />
        <Route
          path="faq"
          element={
            <Suspense fallback={<PageLoader />}>
              <FaqPage />
            </Suspense>
          }
        />
        <Route
          path="contact"
          element={
            <Suspense fallback={<PageLoader />}>
              <ContactPage />
            </Suspense>
          }
        />
        <Route
          path="waiver"
          element={
            <Suspense fallback={<PageLoader />}>
              <WaiverPage />
            </Suspense>
          }
        />
        <Route
          path="account"
          element={
            <Suspense fallback={<PageLoader />}>
              <AccountPage />
            </Suspense>
          }
        />
        <Route
          path="admin"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminDashboardPage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
