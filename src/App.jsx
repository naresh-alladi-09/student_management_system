import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import RoleRoute from './routes/RoleRoute';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import Students from './pages/Students';
import Addstudent from './pages/Addstudent';
import Attendence from './pages/Attendence';
import Performance from './pages/Performance';
import StudentDashboard from './pages/StudentDashboard';
import MarkAttendancePage from './pages/MarkAttendancePage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication & Scan Routes */}
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/login/admin" element={<Login initialRole="admin" />} />
          <Route path="/login/teacher" element={<Login initialRole="teacher" />} />
          <Route path="/login/student" element={<Login initialRole="student" />} />
          <Route path="/mark-attendance" element={<MarkAttendancePage />} />

          {/* Admin Dedicated Console */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </RoleRoute>
              </ProtectedRoute>
            }
          />

          {/* Faculty / Teacher / Admin Shared Operations */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['teacher', 'admin']}>
                  <Dashboard />
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/students"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['teacher', 'admin']}>
                  <Students />
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/addstudents"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['teacher', 'admin']}>
                  <Addstudent />
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['teacher', 'admin']}>
                  <Attendence />
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendence"
            element={<Navigate to="/attendance" replace />}
          />
          <Route
            path="/performance"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['teacher', 'admin']}>
                  <Performance />
                </RoleRoute>
              </ProtectedRoute>
            }
          />

          {/* Student Dedicated Portal Routes */}
          <Route path="/student" element={<Navigate to="/student/dashboard" replace />} />
          <Route
            path="/student/dashboard"
            element={
              <ProtectedRoute>
                <RoleRoute allowedRoles={['student']}>
                  <StudentDashboard />
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/student-dashboard"
            element={<Navigate to="/student/dashboard" replace />}
          />

          {/* Catch-all route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
