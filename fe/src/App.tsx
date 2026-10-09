import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { LocationProvider } from './auth/LocationContext';
import { AdminLayout, Layout, RequireAdmin, RequireAuth } from './components/ui';
import { ThemeProvider } from './theme/ThemeContext';
import { BookingPage, SeatsPage } from './pages/BookingPages';
import { BookingsPage, TicketPage, TicketsPage } from './pages/AccountPages';
import { CinemaPage, HomePage, MoviePage } from './pages/CatalogPages';
import { VerifyEmailPage } from './pages/AuthPages';
import { AdminCinemasPage, AdminDashboardPage, AdminLoginPage, AdminMoviesPage,
  AdminPaymentsPage,
  AdminBookingsPage,
  AdminBookingDetailPage,
  AdminRoomsPage, AdminSeatsPage, AdminShowtimesPage } from './pages/AdminPages';
import './App.css';
import './cobalt-editorial.css';

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
      { path: 'showtimes/:showtimeId/seats', element: <SeatsPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: 'bookings', element: <BookingsPage /> },
          { path: 'bookings/:bookingId', element: <BookingPage /> },
          { path: 'tickets', element: <TicketsPage /> },
          { path: 'tickets/:ticketId', element: <TicketPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  { path: 'admin/login', element: <AdminLoginPage /> },
  {
    element: <RequireAdmin />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: 'admin', element: <AdminDashboardPage /> },
          { path: 'admin/movies', element: <AdminMoviesPage /> },
          { path: 'admin/cinemas', element: <AdminCinemasPage /> },
          { path: 'admin/cinemas/:cinemaId/rooms', element: <AdminRoomsPage /> },
          { path: 'admin/rooms/:roomId/seats', element: <AdminSeatsPage /> },
          { path: 'admin/showtimes', element: <AdminShowtimesPage /> },
          { path: 'admin/payments', element: <AdminPaymentsPage /> },
          { path: 'admin/bookings', element: <AdminBookingsPage /> },
          { path: 'admin/bookings/:id', element: <AdminBookingDetailPage /> },
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
          <RouterProvider router={router} />
        </LocationProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>;
}

export default App;
