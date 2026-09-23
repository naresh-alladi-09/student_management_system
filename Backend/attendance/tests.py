from datetime import date
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status

from accounts.models import UserProfile
from students.models import Department, Branch, AcademicClass, Student
from performance.models import Subject
from attendance.models import AttendanceRecord, AttendanceSession


class AttendanceAnalyticsAPITests(APITestCase):
    def setUp(self):
        # Academic hierarchy
        self.dept, _ = Department.objects.get_or_create(name="Computer Science", code="CS")
        self.branch, _ = Branch.objects.get_or_create(name="Computer Science & Engineering", code="CSE", department=self.dept)
        self.academic_class, _ = AcademicClass.objects.get_or_create(
            branch=self.branch, year=3, semester=5, section="A"
        )

        # Subject
        self.subject, _ = Subject.objects.get_or_create(
            code="CS501", defaults={"name": "Database Systems", "branch": "CSE", "semester": "5", "credits": 4}
        )

        # Admin User
        self.admin_user, _ = User.objects.get_or_create(username="admin_analytics", defaults={"is_staff": True})
        self.admin_user.set_password("adminpass")
        self.admin_user.save()
        UserProfile.objects.update_or_create(user=self.admin_user, defaults={"role": "admin"})

        # Teacher User
        self.teacher_user, _ = User.objects.get_or_create(username="teacher_analytics")
        self.teacher_user.set_password("pass123")
        self.teacher_user.save()
        UserProfile.objects.update_or_create(user=self.teacher_user, defaults={"role": "teacher"})

        # Student 1: Good attendance (e.g. 100%)
        self.student_good = Student.objects.create(
            roll_no="STU-GOOD-01",
            name="Good Student",
            email="good@test.com",
            branch="CSE",
            year=3,
            semester="5",
            section="A",
            academic_class=self.academic_class,
        )

        # Student 2: Low attendance (< 75%)
        self.student_low = Student.objects.create(
            roll_no="STU-LOW-02",
            name="Low Attendance Student",
            email="low@test.com",
            branch="CSE",
            year=3,
            semester="5",
            section="A",
            academic_class=self.academic_class,
        )

        # Create attendance records for Good Student (4 Present, 0 Absent = 100%)
        for i in range(1, 5):
            AttendanceRecord.objects.create(
                student=self.student_good,
                subject=self.subject,
                date=date.today(),
                status="Present",
                marked_via="MANUAL"
            )

        # Create attendance records for Low Student (1 Present, 3 Absent = 25%)
        AttendanceRecord.objects.create(
            student=self.student_low,
            subject=self.subject,
            date=date.today(),
            status="Present",
            marked_via="MANUAL"
        )
        for i in range(1, 4):
            AttendanceRecord.objects.create(
                student=self.student_low,
                subject=self.subject,
                date=date.today(),
                status="Absent",
                marked_via="MANUAL"
            )

    def test_attendance_summary_analytics(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/attendance/summary/?threshold=75')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        # Overall analytics
        self.assertIn('overall', data)
        self.assertIn('total_students', data['overall'])
        self.assertIn('present_today', data['overall'])
        self.assertIn('today_attendance_rate', data['overall'])
        self.assertIn('cumulative_attendance_rate', data['overall'])

        # Multi-dimensional breakdowns
        self.assertIn('branch_wise', data)
        self.assertIn('year_wise', data)
        self.assertIn('section_wise', data)
        self.assertIn('subject_wise', data)
        self.assertIn('recent_trends', data)

        # Low attendance students
        self.assertIn('low_attendance_students', data)
        low_list = data['low_attendance_students']
        self.assertTrue(len(low_list) >= 1)
        low_student_entry = next((s for s in low_list if s['student_id'] == self.student_low.id), None)
        self.assertIsNotNone(low_student_entry)
        self.assertEqual(low_student_entry['attendance_rate'], 25.0)
        self.assertIn("below the 75.0% threshold", low_student_entry['warning'])

    def test_student_attendance_detail_low_warning(self):
        # Authenticate as low attendance student
        self.client.force_authenticate(user=self.student_low.user_profile.user)
        response = self.client.get(f'/api/attendance/student/{self.student_low.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        self.assertEqual(data['attendance_rate'], 25.0)
        self.assertTrue(data['shortage_warning'])
        self.assertIn("below the required threshold", data['warning_message'])

        # Check subject breakdown
        self.assertTrue(len(data['subject_breakdown']) >= 1)
        sub = data['subject_breakdown'][0]
        self.assertEqual(sub['present'], 1)
        self.assertEqual(sub['absent'], 3)
        self.assertEqual(sub['total'], 4)
        self.assertEqual(sub['percentage'], 25.0)
        self.assertTrue(sub['is_shortage'])
        self.assertIn("below the required threshold", sub['warning'])
