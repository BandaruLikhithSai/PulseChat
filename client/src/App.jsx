import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { PresenceProvider } from './context/PresenceContext.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import AuthPage from './pages/AuthPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <PresenceProvider>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<ChatPage />} />
                <Route path="/chat/:conversationId" element={<ChatPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PresenceProvider>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
