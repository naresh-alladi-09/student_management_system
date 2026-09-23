/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from "react";
import { loginApi, logoutApi, getMeApi } from "../services/studentservice";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("sms_auth_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("sms_auth_user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("sms_auth_user");
    }
  }, [currentUser]);

  // Unified Login for Admin, Teacher, or Student
  const loginUser = async (identifier, password, roleRequested = null) => {
    const trimmedId = (identifier || "").trim();
    const trimmedPass = (password || "").trim();

    try {
      setLoading(true);
      const res = await loginApi({
        identifier: trimmedId,
        username: trimmedId,
        password: trimmedPass,
        role: roleRequested,
      });

      const data = res.data;
      const role = data.role || "teacher";

      let userData = {
        role: role,
        token: data.token,
        userId: data.user_id,
        username: data.username,
        email: data.email,
        name: data.name || data.username,
        department: data.department || "Academic Operations",
        isStaff: Boolean(data.is_staff),
      };

      if (role === "student" && data.student) {
        const s = data.student;
        userData = {
          ...userData,
          id: s.id,
          name: s.name,
          rollNo: s.rollNo,
          phone: s.phone,
          branch: s.branch,
          year: s.year,
          semester: s.semester,
        };
      }

      setCurrentUser(userData);
      setLoading(false);
      return { success: true, user: userData };
    } catch (err) {
      setLoading(false);
      let errMsg = "Authentication failed. Please check your credentials.";
      if (!err.response) {
        errMsg =
          "Cannot connect to the backend server. If using Vercel, please ensure your backend is deployed and VITE_API_URL is configured in Vercel Environment Variables.";
      } else if (err.response.data?.detail) {
        errMsg = err.response.data.detail;
      } else if (err.response.data?.error) {
        errMsg = err.response.data.error;
      }
      return { success: false, message: errMsg };
    }
  };

  const loginTeacher = async (username, password) => {
    return loginUser(username, password, "teacher");
  };

  const loginStudent = async (identifier, password) => {
    return loginUser(identifier, password, "student");
  };

  const loginAdmin = async (username, password) => {
    return loginUser(username, password, "admin");
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch {
      // ignore
    }
    setCurrentUser(null);
    localStorage.removeItem("sms_auth_user");
  };

  const refreshUser = async () => {
    try {
      const res = await getMeApi();
      const data = res.data;
      if (currentUser) {
        const updated = {
          ...currentUser,
          role: data.role,
          name: data.name,
          department: data.department,
        };
        if (data.student) {
          Object.assign(updated, data.student);
        }
        setCurrentUser(updated);
      }
    } catch {
      // ignore
    }
  };

  const role = currentUser?.role || null;
  const isAdmin = role === "admin" || Boolean(currentUser?.isStaff);
  const isTeacher = role === "teacher" || isAdmin;
  const isStudent = role === "student";

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role,
        isAdmin,
        isTeacher,
        isStudent,
        loginUser,
        loginTeacher,
        loginStudent,
        loginAdmin,
        logout,
        refreshUser,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
