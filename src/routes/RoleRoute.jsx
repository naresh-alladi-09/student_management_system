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

  // Admins have access to teacher routes as well
  if (allowedRoles.includes("teacher") && isAdmin) {
    return children;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
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
