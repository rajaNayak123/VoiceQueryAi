import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { setAuthTokenGetter } from "./api/client";
import { UploadPage } from "./pages/UploadPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CallPage } from "./pages/CallPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";

export default function App() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  return (
    <Routes>
      {/* Public Home & Landing Page */}
      <Route path="/" element={<UploadPage />} />

      {/* Protected Document Studio & Library */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Protected Voice Call Room */}
      <Route
        path="/call/:documentId"
        element={
          <ProtectedRoute>
            <CallPage />
          </ProtectedRoute>
        }
      />

      {/* 404 Fallback */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}


