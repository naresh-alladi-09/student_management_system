import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const RoleRoute = ({ allowedRoles = [], excludeAdmin = false, children }) => {
  const { currentUser, role, isStudent, isAdmin } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (excludeAdmin && isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  // Admins have access to admin and teacher routes
  if (isAdmin && (allowedRoles.includes("admin") || allowedRoles.includes("teacher") || allowedRoles.includes("faculty"))) {
    return children;
  }

  // Teachers and Faculty have access to teacher routes
  if ((role === "teacher" || role === "faculty") && (allowedRoles.includes("teacher") || allowedRoles.includes("faculty"))) {
    return children;
  }

  const normalizedRole = role === "faculty" ? "teacher" : role;
  if (allowedRoles.length > 0 && !allowedRoles.includes(role) && !allowedRoles.includes(normalizedRole)) {
    // Redirect to respective home dashboard based on role
    if (isStudent) {
      return <Navigate to="/student/dashboard" replace />;
    } else if (isAdmin) {
      return <Navigate to="/admin" replace />;
    } else {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children;
};

export default RoleRoute;
