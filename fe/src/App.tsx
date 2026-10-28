import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { LocationProvider } from './auth/LocationContext';
import { AdminLayout, Layout, LoadingState, RequireAdmin, RequireAuth } from './components/ui';
import { ThemeProvider } from './theme/ThemeContext';
import './App.css';
import './cobalt-editorial.css';
import './cinebook-refresh.css';

const HomePage = lazy(() => import('./features/catalog/HomePage').then((module) => ({ default: module.HomePage })));
const CinemaPage = lazy(() => import('./features/catalog/CinemaPage').then((module) => ({ default: module.CinemaPage })));
const MoviePage = lazy(() => import('./features/catalog/MoviePage').then((module) => ({ default: module.MoviePage })));
const SeatsPage = lazy(() => import('./features/booking/SeatsPage').then((module) => ({ default: module.SeatsPage })));
const BookingPage = lazy(() => import('./features/booking/BookingPage').then((module) => ({ default: module.BookingPage })));
const BookingsPage = lazy(() => import('./features/account/BookingsPage').then((module) => ({ default: module.BookingsPage })));
const SecurityPage = lazy(() => import('./features/account/SecurityPage').then((module) => ({ default: module.SecurityPage })));
const ProfilePage = lazy(() => import('./features/account/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const TicketPage = lazy(() => import('./features/account/TicketPage').then((module) => ({ default: module.TicketPage })));
const BookingTicketsPage = lazy(() => import('./features/account/BookingTicketsPage').then((module) => ({ default: module.BookingTicketsPage })));
const TicketsPage = lazy(() => import('./features/account/TicketsPage').then((module) => ({ default: module.TicketsPage })));
const ResetPasswordPage = lazy(() => import('./features/auth/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })));
const VerifyEmailPage = lazy(() => import('./features/auth/VerifyEmailPage').then((module) => ({ default: module.VerifyEmailPage })));
const AdminLoginPage = lazy(() => import('./features/admin/AdminLoginPage').then((module) => ({ default: module.AdminLoginPage })));
const AdminDashboardPage = lazy(() => import('./features/admin/dashboard/AdminDashboardPage').then((module) => ({ default: module.AdminDashboardPage })));
const AdminMoviesPage = lazy(() => import('./features/admin/movies/AdminMoviesPage').then((module) => ({ default: module.AdminMoviesPage })));
const AdminCombosPage = lazy(() => import('./features/admin/combos/AdminCombosPage').then((module) => ({ default: module.AdminCombosPage })));
const AdminVouchersPage = lazy(() => import('./features/admin/vouchers/AdminVouchersPage').then((module) => ({ default: module.AdminVouchersPage })));
const AdminCinemasPage = lazy(() => import('./features/admin/cinemas/AdminCinemasPage').then((module) => ({ default: module.AdminCinemasPage })));
const AdminRoomsPage = lazy(() => import('./features/admin/cinemas/AdminCinemasPage').then((module) => ({ default: module.AdminRoomsPage })));
const AdminSeatsPage = lazy(() => import('./features/admin/cinemas/AdminCinemasPage').then((module) => ({ default: module.AdminSeatsPage })));
const AdminShowtimesPage = lazy(() => import('./features/admin/showtimes/AdminShowtimesPage').then((module) => ({ default: module.AdminShowtimesPage })));
const AdminPaymentsPage = lazy(() => import('./features/admin/payments/AdminPaymentsPage').then((module) => ({ default: module.AdminPaymentsPage })));
const AdminBookingsPage = lazy(() => import('./features/admin/bookings/AdminBookingsPage').then((module) => ({ default: module.AdminBookingsPage })));
const AdminBookingDetailPage = lazy(() => import('./features/admin/bookings/AdminBookingDetailPage').then((module) => ({ default: module.AdminBookingDetailPage })));
const AdminUsersPage = lazy(() => import('./features/admin/users/AdminUsersPage').then((module) => ({ default: module.AdminUsersPage })));
const AdminAcceptInvitationPage = lazy(() => import('./features/admin/users/AdminInvitation').then((module) => ({ default: module.AdminAcceptInvitationPage })));
const AdminAuditLogsPage = lazy(() => import('./features/admin/audit/AdminAuditLogsPage').then((module) => ({ default: module.AdminAuditLogsPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'cinemas', element: <CinemaPage /> },
      { path: 'movies/:movieId', element: <MoviePage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'showtimes/:showtimeId/seats', element: <SeatsPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: 'bookings', element: <BookingsPage /> },
          { path: 'account/profile', element: <ProfilePage /> },
          { path: 'account/security', element: <SecurityPage /> },
          { path: 'bookings/:bookingId', element: <BookingPage /> },
          { path: 'tickets', element: <TicketsPage /> },
          { path: 'tickets/:ticketId', element: <TicketPage /> },
          { path: 'bookings/:bookingId/tickets', element: <BookingTicketsPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  { path: 'admin/login', element: <AdminLoginPage /> },
  { path: 'admin/accept-invitation', element: <AdminAcceptInvitationPage /> },
  {
    element: <RequireAdmin />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: 'admin', element: <AdminDashboardPage /> },
          { path: 'admin/movies', element: <AdminMoviesPage /> },
          { path: 'admin/combos', element: <AdminCombosPage /> },
          { path: 'admin/vouchers', element: <AdminVouchersPage /> },
          { path: 'admin/cinemas', element: <AdminCinemasPage /> },
          { path: 'admin/cinemas/:cinemaId/rooms', element: <AdminRoomsPage /> },
          { path: 'admin/rooms/:roomId/seats', element: <AdminSeatsPage /> },
          { path: 'admin/showtimes', element: <AdminShowtimesPage /> },
          { path: 'admin/payments', element: <AdminPaymentsPage /> },
          { path: 'admin/bookings', element: <AdminBookingsPage /> },
          { path: 'admin/bookings/:id', element: <AdminBookingDetailPage /> },
          { path: 'admin/users', element: <AdminUsersPage /> },
          { path: 'admin/audit-logs', element: <AdminAuditLogsPage /> },
        ],
      },
    ],
  },
]);

function App() {
  return <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <LocationProvider>
          <Suspense fallback={<LoadingState label="Đang tải trang…" />}>
            <RouterProvider router={router} />
          </Suspense>
        </LocationProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>;
}

export default App;
