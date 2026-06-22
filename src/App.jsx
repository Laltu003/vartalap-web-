import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import CallOverlay from './components/CallOverlay';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ChatPage from './pages/ChatPage';
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import CameraPage from './pages/CameraPage';

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { currentUser, userProfile } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (userProfile?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { currentUser } = useAuth();
  return !currentUser ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { currentUser } = useAuth();

  // CallProvider/Overlay only make sense once authenticated (they
  // depend on currentUser.uid for the Firebase listener path)
  const routes = (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
      <Route path="/camera" element={<PrivateRoute><CameraPage /></PrivateRoute>} />
      <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );

  if (!currentUser) return routes;

  return (
    <CallProvider>
      {routes}
      <CallOverlay />
    </CallProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#5B3FE0',
              color: '#fff',
              fontSize: '14px',
              borderRadius: '10px',
            },
          }}
        />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
