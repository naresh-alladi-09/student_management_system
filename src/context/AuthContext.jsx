/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from "react";
import { loginApi, logoutApi } from "../services/studentservice";

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

  // Teacher Login via Real Database API
  const loginTeacher = async (username, password) => {
    const trimmedUser = (username || "").trim();
    const trimmedPass = (password || "").trim();

    try {
      setLoading(true);
      const res = await loginApi({
        username: trimmedUser,
        password: trimmedPass,
        role: "teacher",
      });

      const data = res.data;
      const teacherUser = {
        role: data.role || "teacher",
        token: data.token,
        username: data.username,
        name: data.name || "Faculty Admin",
        title: "Faculty Advisor",
        department: data.department || "Academic Operations",
      };
      setCurrentUser(teacherUser);
      setLoading(false);
      return { success: true, user: teacherUser };
    } catch (err) {
      setLoading(false);
      const errMsg =
        err.response?.data?.detail ||
        "Invalid teacher credentials. Please check your username and password.";
      return { success: false, message: errMsg };
    }
  };

  // Student Login via Real Database API
  const loginStudent = async (identifier, password) => {
    setLoading(true);
    const idClean = (identifier || "").trim();
    const passClean = (password || "").trim();

    try {
      const res = await loginApi({
        identifier: idClean,
        password: passClean,
        role: "student",
      });

      const data = res.data;
      const studentData = data.student || {};
      const studentUser = {
        role: "student",
        token: data.token,
        username: data.username,
        id: studentData.id,
        name: studentData.name || data.name,
        rollNo: studentData.rollNo || data.username,
        email: studentData.email || data.email,
        phone: studentData.phone || "",
        branch: studentData.branch || "CSE",
        year: studentData.year || 1,
        semester: studentData.semester || "1",
      };
      setCurrentUser(studentUser);
      setLoading(false);
      return { success: true, user: studentUser };
    } catch (err) {
      setLoading(false);
      const errMsg =
        err.response?.data?.detail ||
        "Incorrect student credentials. Use your Roll No / Email and password 'student123'.";
      return { success: false, message: errMsg };
    }
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

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role: currentUser?.role || null,
        isTeacher: currentUser?.role === "teacher" || currentUser?.role === "admin",
        isStudent: currentUser?.role === "student",
        loginTeacher,
        loginStudent,
        logout,
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
