import axios from "axios";

const API_URL = "http://127.0.0.1:8000/api/students/";

export const getStudents = () => {
  return axios.get(API_URL);
};

export const addStudent = (studentData) => {
  return axios.post(API_URL, studentData);
};

export const updateStudent = (id, studentData) => {
  return axios.put(`${API_URL}${id}/`, studentData);
};

export const deleteStudent = (id) => {
  return axios.delete(`${API_URL}${id}/`);
};