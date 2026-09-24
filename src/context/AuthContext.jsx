/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from "react";
import { loginApi, logoutApi, getMeApi } from "../services/studentservice";
import { API_BASE_URL } from "../services/apiClient";

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
        if (err.code === "ECONNABORTED" || err.message?.toLowerCase().includes("timeout")) {
          errMsg =
            "Connection timed out (backend took >60s to respond). If your Render backend is sleeping on the free tier, it takes ~50-60 seconds to wake up. Please wait 30 seconds and try again!";
        } else if (
          API_BASE_URL.includes("127.0.0.1") ||
          API_BASE_URL.includes("localhost")
        ) {
          errMsg = `Frontend is connected to "${API_BASE_URL}". On Vercel, Vite bakes variables at build-time. Go to Vercel Settings > Environment Variables, add "VITE_API_URL" with your Render URL, then go to Deployments and click "Redeploy".`;
        } else {
          errMsg = `Cannot connect to backend server at "${API_BASE_URL}". Verify your Render Web Service is Active (not suspended or crashed) and that it allows CORS requests.`;
        }
      } else if (err.response.data?.detail) {
        errMsg = err.response.data.detail;
      } else if (err.response.data?.error) {
        errMsg = err.response.data.error;
      } else if (err.response.data?.non_field_errors) {
        errMsg = Array.isArray(err.response.data.non_field_errors)
          ? err.response.data.non_field_errors.join(", ")
          : err.response.data.non_field_errors;
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
        apiBaseUrl: API_BASE_URL,
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
