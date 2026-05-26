import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "./components/layout/Layout";
import { PageLoader } from "./components/common/PageLoader";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { useAuth } from "./context/AuthContext";

// Eager load HomePage for fastest initial render
import { HomePage } from "./pages/HomePage";

// Lazy load other pages for code splitting
const MembershipPage = lazy(() => import("./pages/MembershipPage").then(m => ({ default: m.MembershipPage })));
const BookPartyPage = lazy(() => import("./pages/BookPartyPage").then(m => ({ default: m.BookPartyPage })));
const BuyTicketPage = lazy(() => import("./pages/BuyTicketPage").then(m => ({ default: m.BuyTicketPage })));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage").then(m => ({ default: m.CheckoutPage })));
const EventsPage = lazy(() => import("./pages/EventsPage").then(m => ({ default: m.EventsPage })));
const EventDetailPage = lazy(() => import("./pages/EventDetailPage").then(m => ({ default: m.EventDetailPage })));
const TestimonialsPage = lazy(() => import("./pages/TestimonialsPage").then(m => ({ default: m.TestimonialsPage })));
const FaqPage = lazy(() => import("./pages/FaqPage").then(m => ({ default: m.FaqPage })));
const ContactPage = lazy(() => import("./pages/ContactPage").then(m => ({ default: m.ContactPage })));
const WaiverPage = lazy(() => import("./pages/WaiverPage").then(m => ({ default: m.WaiverPage })));
const AccountPage = lazy(() => import("./pages/AccountPage").then(m => ({ default: m.AccountPage })));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage").then(m => ({ default: m.AdminDashboardPage })));
const AdminApplicantsPage = lazy(() => import("./pages/AdminApplicantsPage").then(m => ({ default: m.AdminApplicantsPage })));
const AdminApplicantDetailPage = lazy(() => import("./pages/AdminApplicantDetailPage").then(m => ({ default: m.AdminApplicantDetailPage })));
const AdminEventsPage = lazy(() => import("./pages/AdminEventsPanel").then(m => ({ default: m.AdminEventsPanel })));
const AdminTeamPage = lazy(() => import("./pages/AdminTeamPage").then(m => ({ default: m.AdminTeamPage })));
const AdminMarketingPage = lazy(() => import("./pages/AdminMarketingPage").then(m => ({ default: m.AdminMarketingPage })));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage").then(m => ({ default: m.AuthCallbackPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then(m => ({ default: m.ResetPasswordPage })));
const CartPage = lazy(() => import("./pages/CartPage").then(m => ({ default: m.CartPage })));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage").then(m => ({ default: m.PrivacyPage })));
const GuestPolicyPage = lazy(() => import("./pages/GuestPolicyPage").then(m => ({ default: m.GuestPolicyPage })));
const RefundPolicyPage = lazy(() => import("./pages/RefundPolicyPage").then(m => ({ default: m.RefundPolicyPage })));
const WaiverPolicyPage = lazy(() => import("./pages/WaiverPolicyPage").then(m => ({ default: m.WaiverPolicyPage })));
const SmsTermsPage = lazy(() => import("./pages/SmsTermsPage").then(m => ({ default: m.SmsTermsPage })));
const CareersPage = lazy(() => import("./pages/CareersPage").then(m => ({ default: m.CareersPage })));
const CareerApplyPage = lazy(() => import("./pages/CareerApplyPage").then(m => ({ default: m.CareerApplyPage })));

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isTeamMember, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isTeamMember) return <Navigate to="/account" replace />;
  return <>{children}</>;
}

// Admin-only areas (content/management). Staff (employee) get redirected to the
// operations dashboard, which is the only admin surface they may use.
function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isTeamMember, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!isTeamMember) return <Navigate to="/account" replace />;
  if (!isAdmin) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
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
          path="cart"
          element={
            <Suspense fallback={<PageLoader />}>
              <CartPage />
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
          path="events/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <EventDetailPage />
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
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <AdminDashboardPage />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="admin/applicants"
          element={
            <AdminOnlyRoute>
              <Suspense fallback={<PageLoader />}>
                <AdminApplicantsPage />
              </Suspense>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="admin/applicants/:id"
          element={
            <AdminOnlyRoute>
              <Suspense fallback={<PageLoader />}>
                <AdminApplicantDetailPage />
              </Suspense>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="admin/events"
          element={
            <AdminOnlyRoute>
              <Suspense fallback={<PageLoader />}>
                <AdminEventsPage />
              </Suspense>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="admin/team"
          element={
            <AdminOnlyRoute>
              <Suspense fallback={<PageLoader />}>
                <AdminTeamPage />
              </Suspense>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="admin/marketing"
          element={
            <AdminOnlyRoute>
              <Suspense fallback={<PageLoader />}>
                <AdminMarketingPage />
              </Suspense>
            </AdminOnlyRoute>
          }
        />
        <Route
          path="auth/callback"
          element={
            <Suspense fallback={<PageLoader />}>
              <AuthCallbackPage />
            </Suspense>
          }
        />
        <Route
          path="auth/reset-password"
          element={
            <Suspense fallback={<PageLoader />}>
              <ResetPasswordPage />
            </Suspense>
          }
        />
        <Route
          path="privacy"
          element={
            <Suspense fallback={<PageLoader />}>
              <PrivacyPage />
            </Suspense>
          }
        />
        <Route
          path="guest-policy"
          element={
            <Suspense fallback={<PageLoader />}>
              <GuestPolicyPage />
            </Suspense>
          }
        />
        <Route
          path="refund-policy"
          element={
            <Suspense fallback={<PageLoader />}>
              <RefundPolicyPage />
            </Suspense>
          }
        />
        <Route
          path="waiver-policy"
          element={
            <Suspense fallback={<PageLoader />}>
              <WaiverPolicyPage />
            </Suspense>
          }
        />
        <Route
          path="careers"
          element={
            <Suspense fallback={<PageLoader />}>
              <CareersPage />
            </Suspense>
          }
        />
        <Route
          path="careers/:slug"
          element={
            <Suspense fallback={<PageLoader />}>
              <CareersPage />
            </Suspense>
          }
        />
        <Route
          path="careers/apply/:listingId"
          element={
            <Suspense fallback={<PageLoader />}>
              <CareerApplyPage />
            </Suspense>
          }
        />
        <Route
          path="sms-terms"
          element={
            <Suspense fallback={<PageLoader />}>
              <SmsTermsPage />
            </Suspense>
          }
        />
        {/* Redirect /terms to waiver-policy */}
        <Route path="terms" element={<Navigate to="/waiver-policy" replace />} />
        {/* Catch-all 404 route */}
        <Route
          path="*"
          element={
            <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
              <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Page Not Found</h1>
              <p style={{ color: '#666', marginBottom: '2rem' }}>The page you're looking for doesn't exist.</p>
              <a href="/" style={{ color: '#6C63FF', textDecoration: 'underline' }}>Go back home</a>
            </div>
          }
        />
      </Route>
    </Routes>
    </ErrorBoundary>
  );
}

export default App;
