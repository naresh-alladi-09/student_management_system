import React, { createContext, useContext, useState, useEffect } from "react";
import { getStudents } from "../services/studentservice";

const AuthContext = createContext(null);

export const DEFAULT_DEMO_STUDENT = {
  id: 101,
  name: "Alex Johnson",
  email: "alex.johnson@edu.com",
  phone: "9876543210",
  branch: "CSE",
  year: 3,
  semester: "5",
  rollNo: "STU-2024-101",
  cgpa: 8.85,
  attendanceRate: 91,
};

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

  // Teacher Login
  const loginTeacher = (username, password) => {
    const trimmedUser = (username || "").trim();
    const trimmedPass = (password || "").trim();

    if (
      (trimmedUser === "madam" && trimmedPass === "123456") ||
      (trimmedUser === "admin" && trimmedPass === "admin")
    ) {
      const teacherUser = {
        role: "teacher",
        username: trimmedUser,
        name: trimmedUser === "admin" ? "System Admin" : "Faculty Admin",
        title: "Faculty Advisor",
        department: "Academic Operations",
      };
      setCurrentUser(teacherUser);
      return { success: true, user: teacherUser };
    }

    return {
      success: false,
      message: "Invalid teacher credentials. Use 'madam' / '123456' or 'admin' / 'admin'.",
    };
  };

  // Student Login
  const loginStudent = async (identifier, password) => {
    setLoading(true);
    const idClean = (identifier || "").trim().toLowerCase();
    const passClean = (password || "").trim();

    try {
      // 1. Check if it matches the default demo student
      if (
        idClean === "alex.johnson@edu.com" ||
        idClean === "101" ||
        idClean === "stu-2024-101" ||
        idClean === "demo" ||
        idClean === "student"
      ) {
        if (passClean === "student123" || passClean === "123456" || passClean === "9876543210") {
          const studentUser = {
            role: "student",
            ...DEFAULT_DEMO_STUDENT,
          };
          setCurrentUser(studentUser);
          setLoading(false);
          return { success: true, user: studentUser };
        } else {
          setLoading(false);
          return {
            success: false,
            message: "Incorrect student password. Default demo password is 'student123'.",
          };
        }
      }

      // 2. Query registered students from the backend API
      let registeredStudents = [];
      try {
        const res = await getStudents();
        registeredStudents = res.data || [];
      } catch (err) {
        console.warn("Could not fetch students from backend; checking fallback.", err);
      }

      // Find matching student
      const matched = registeredStudents.find(
        (s) =>
          (s.email && s.email.toLowerCase() === idClean) ||
          String(s.id) === idClean ||
          (s.phone && s.phone.trim() === idClean) ||
          (s.name && s.name.toLowerCase() === idClean)
      );

      if (matched) {
        // Allow login if password is 'student123', or student's phone number, or '123456'
        const validPasswords = [
          "student123",
          "123456",
          matched.phone ? matched.phone.trim() : "",
          String(matched.id),
        ].filter(Boolean);

        if (validPasswords.includes(passClean)) {
          const studentUser = {
            role: "student",
            ...matched,
            rollNo: `STU-2024-00${matched.id}`,
            attendanceRate: 85 + (matched.id % 12),
            cgpa: +(7.5 + ((matched.id * 3) % 20) / 10).toFixed(2),
          };
          setCurrentUser(studentUser);
          setLoading(false);
          return { success: true, user: studentUser };
        } else {
          setLoading(false);
          return {
            success: false,
            message: "Incorrect password. Default is 'student123' or your registered phone number.",
          };
        }
      }

      // 3. Fallback: if student list is empty or identifier wasn't found in DB,
      // allow entering with default demo student or dynamic temporary profile
      if (passClean === "student123" || passClean === "123456") {
        const dynamicStudent = {
          role: "student",
          id: 102,
          name: identifier.includes("@") ? identifier.split("@")[0].toUpperCase() : identifier,
          email: identifier.includes("@") ? identifier : `${identifier}@edu.com`,
          phone: "9123456780",
          branch: "CSE",
          year: 3,
          semester: "5",
          rollNo: `STU-${Math.floor(1000 + Math.random() * 9000)}`,
          cgpa: 8.5,
          attendanceRate: 89,
        };
        setCurrentUser(dynamicStudent);
        setLoading(false);
        return { success: true, user: dynamicStudent };
      }

      setLoading(false);
      return {
        success: false,
        message: "Student record not found. Try student email / ID with password 'student123'.",
      };
    } catch (error) {
      setLoading(false);
      return {
        success: false,
        message: "An error occurred during student login. Please try again.",
      };
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem("sms_auth_user");
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role: currentUser?.role || null,
        isTeacher: currentUser?.role === "teacher",
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
