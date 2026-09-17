import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { LocationProvider } from './auth/LocationContext';
import { AdminLayout, Layout, RequireAdmin, RequireAuth } from './components/ui';
import { BookingPage, SeatsPage } from './pages/BookingPages';
import { BookingsPage, TicketPage, TicketsPage } from './pages/AccountPages';
import { CinemaPage, HomePage, MoviePage } from './pages/CatalogPages';
import { AdminCinemasPage, AdminDashboardPage, AdminLoginPage, AdminMoviesPage, AdminRoomsPage, AdminSeatsPage, AdminShowtimesPage } from './pages/AdminPages';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <LocationProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="cinemas" element={<CinemaPage />} />
              <Route path="movies/:movieId" element={<MoviePage />} />
              <Route path="showtimes/:showtimeId/seats" element={<SeatsPage />} />
              <Route element={<RequireAuth />}>
                <Route path="bookings" element={<BookingsPage />} />
                <Route path="bookings/:bookingId" element={<BookingPage />} />
                <Route path="tickets" element={<TicketsPage />} />
                <Route path="tickets/:ticketId" element={<TicketPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
            <Route path="admin/login" element={<AdminLoginPage />} />
            <Route element={<RequireAdmin />}>
              <Route element={<AdminLayout />}>
                <Route path="admin" element={<AdminDashboardPage />} />
                <Route path="admin/movies" element={<AdminMoviesPage />} />
                <Route path="admin/cinemas" element={<AdminCinemasPage />} />
                <Route path="admin/cinemas/:cinemaId/rooms" element={<AdminRoomsPage />} />
                <Route path="admin/rooms/:roomId/seats" element={<AdminSeatsPage />} />
                <Route path="admin/showtimes" element={<AdminShowtimesPage />} />
              </Route>
            </Route>
          </Routes>
        </LocationProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>;
}

export default App;
