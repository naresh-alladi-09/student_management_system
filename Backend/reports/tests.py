from datetime import date
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status

from accounts.models import UserProfile
from students.models import Department, Branch, AcademicClass, Student
from performance.models import Subject, StudentScore
from attendance.models import AttendanceRecord
from audit.models import AuditLog


class ReportsAPITests(APITestCase):
    def setUp(self):
        # Academic hierarchy
        self.dept, _ = Department.objects.get_or_create(name="Computer Science", code="CS_REP")
        self.branch, _ = Branch.objects.get_or_create(name="CSE Branch", code="CSE", department=self.dept)
        self.academic_class, _ = AcademicClass.objects.get_or_create(
            branch=self.branch, year=3, semester=5, section="A"
        )

        # Subject
        self.subject, _ = Subject.objects.get_or_create(
            code="CS501_REP", defaults={"name": "DBMS", "branch": "CSE", "semester": "5", "credits": 4}
        )

        # Admin
        self.admin_user, _ = User.objects.get_or_create(username="rep_admin", defaults={"is_staff": True})
        self.admin_user.set_password("adminpass")
        self.admin_user.save()
        UserProfile.objects.update_or_create(user=self.admin_user, defaults={"role": "admin"})

        # Teacher
        self.teacher_user, _ = User.objects.get_or_create(username="rep_teacher")
        self.teacher_user.set_password("teachpass")
        self.teacher_user.save()
        UserProfile.objects.update_or_create(user=self.teacher_user, defaults={"role": "teacher"})

        # Student 1: Good attendance
        self.student_1 = Student.objects.create(
            roll_no="STU-REP-01",
            name="Grace Hopper",
            email="grace@test.com",
            branch="CSE",
            year=3,
            semester="5",
            section="A",
            academic_class=self.academic_class,
        )

        # Student 2: Low attendance
        self.student_2 = Student.objects.create(
            roll_no="STU-REP-02",
            name="Alan Turing",
            email="alan@test.com",
            branch="CSE",
            year=3,
            semester="5",
            section="A",
            academic_class=self.academic_class,
        )

        # Attendance records
        # Grace: 4 Present = 100%
        for i in range(4):
            AttendanceRecord.objects.create(
                student=self.student_1,
                subject=self.subject,
                date=date.today(),
                status="Present",
                marked_via="QR"
            )

        # Alan: 1 Present, 3 Absent = 25%
        AttendanceRecord.objects.create(
            student=self.student_2,
            subject=self.subject,
            date=date.today(),
            status="Present",
            marked_via="MANUAL"
        )
        for i in range(3):
            AttendanceRecord.objects.create(
                student=self.student_2,
                subject=self.subject,
                date=date.today(),
                status="Absent",
                marked_via="MANUAL"
            )

        # Scores
        StudentScore.objects.create(
            student=self.student_1,
            subject=self.subject,
            internals=38.0,
            end_sem=58.0
        )

    def test_attendance_report_json_and_csv(self):
        """Attendance report returns 1 row per student ID in Student Name,Custom Student ID,Classes Attended,Total Classes,Attendance % format."""
        self.client.force_authenticate(user=self.admin_user)

        # JSON
        res_json = self.client.get('/api/reports/attendance/?branch=CSE&section=A')
        self.assertEqual(res_json.status_code, status.HTTP_200_OK)
        self.assertIn("students", res_json.data)
        self.assertEqual(len(res_json.data["students"]), 2)

        # CSV Export
        res_csv = self.client.get('/api/reports/attendance/?branch=CSE&export=csv')
        self.assertEqual(res_csv.status_code, status.HTTP_200_OK)
        self.assertEqual(res_csv['Content-Type'], 'text/csv')
        self.assertIn('attachment; filename="attendance_report_', res_csv['Content-Disposition'])
        content = res_csv.content.decode('utf-8')
        self.assertIn("Student Name,Custom Student ID,Classes Attended,Total Classes,Attendance %", content)
        self.assertIn("Grace Hopper", content)
        self.assertIn("Alan Turing", content)

        # Verify strictly 1 row per student ID
        lines = [l.strip() for l in content.strip().splitlines() if l.strip()]
        grace_lines = [l for l in lines if "Grace Hopper" in l]
        alan_lines = [l for l in lines if "Alan Turing" in l]
        self.assertEqual(len(grace_lines), 1, "Grace Hopper must appear in exactly 1 row")
        self.assertEqual(len(alan_lines), 1, "Alan Turing must appear in exactly 1 row")
        self.assertIn("100.0", grace_lines[0])
        self.assertIn("25.0", alan_lines[0])

        # Verify AuditLog created
        audit = AuditLog.objects.filter(action="REPORT_GENERATE", entity="AttendanceReport").first()
        self.assertIsNotNone(audit)

    def test_attendance_report_period_calculation_by_date_and_studentid(self):
        """Attendance export calculates total classes and attended per studentid across date range in 1 single row."""
        self.client.force_authenticate(user=self.admin_user)

        today_str = date.today().isoformat()

        # Detailed period export filtered by student_id and date range
        res = self.client.get(
            f'/api/reports/attendance/?student_id={self.student_2.roll_no}&date_from={today_str}&date_to={today_str}&export=csv'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        content = res.content.decode('utf-8')

        lines = [l.strip() for l in content.strip().splitlines() if l.strip()]
        # Header + exactly 1 data row for Alan Turing
        self.assertEqual(len(lines), 2)
        self.assertIn("Alan Turing", lines[1])
        self.assertIn("STU-REP-02", lines[1])
        self.assertIn("25.0", lines[1])

    def test_low_attendance_report_and_csv(self):
        """Low attendance report identifies students below threshold with CSV export."""
        self.client.force_authenticate(user=self.teacher_user)

        # JSON
        res = self.client.get('/api/reports/low-attendance/?threshold=75')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        shortage_students = res.data["students"]
        alan_entry = next((s for s in shortage_students if s['roll_no'] == 'STU-REP-02'), None)
        self.assertIsNotNone(alan_entry)
        self.assertEqual(alan_entry['percentage'], 25.0)
        self.assertTrue(alan_entry['classes_needed'] > 0)

        # CSV
        res_csv = self.client.get('/api/reports/low-attendance/?threshold=75&export=csv')
        self.assertEqual(res_csv.status_code, status.HTTP_200_OK)
        self.assertEqual(res_csv['Content-Type'], 'text/csv')
        content = res_csv.content.decode('utf-8')
        self.assertIn("Alan Turing", content)

    def test_student_roster_report_and_csv(self):
        """Student roster report returns active students directory and CSV export."""
        self.client.force_authenticate(user=self.admin_user)

        res_csv = self.client.get('/api/reports/students/?branch=CSE&export=csv')
        self.assertEqual(res_csv.status_code, status.HTTP_200_OK)
        self.assertEqual(res_csv['Content-Type'], 'text/csv')
        content = res_csv.content.decode('utf-8')
        self.assertIn("Grace Hopper", content)
        self.assertIn("Alan Turing", content)

    def test_performance_report_and_csv(self):
        """Performance report returns gradebook scores with CSV export."""
        self.client.force_authenticate(user=self.admin_user)

        res_csv = self.client.get('/api/reports/performance/?branch=CSE&export=csv')
        self.assertEqual(res_csv.status_code, status.HTTP_200_OK)
        self.assertEqual(res_csv['Content-Type'], 'text/csv')
        content = res_csv.content.decode('utf-8')
        self.assertIn("Grace Hopper", content)
        self.assertIn("CS501_REP", content)
        self.assertIn("96.0", content)
        self.assertIn("PASSED", content)

    def test_student_cannot_access_reports(self):
        """Students must be denied access to administrative reporting endpoints."""
        self.client.force_authenticate(user=self.student_1.user_profile.user)

        res = self.client.get('/api/reports/attendance/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        res_perf = self.client.get('/api/reports/performance/')
        self.assertEqual(res_perf.status_code, status.HTTP_403_FORBIDDEN)
