from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status

from accounts.models import UserProfile
from students.models import Department, Branch, AcademicClass, Student, FacultyAssignment
from performance.models import Subject, StudentScore
from audit.models import AuditLog
from notifications.models import Notification


class PerformanceWorkflowAPITests(APITestCase):
    def setUp(self):
        # 1. Academic Hierarchy
        self.dept, _ = Department.objects.get_or_create(name="Computer Science", code="CS_PERF")
        self.branch, _ = Branch.objects.get_or_create(name="Computer Science & Engineering", code="CSE", department=self.dept)
        self.academic_class, _ = AcademicClass.objects.get_or_create(
            branch=self.branch, year=3, semester=5, section="A"
        )

        # 2. Subjects
        self.sub_dbms, _ = Subject.objects.get_or_create(
            code="CS501_DBMS",
            defaults={"name": "Database Management Systems", "branch": "CSE", "semester": "5", "credits": 4}
        )
        self.sub_os, _ = Subject.objects.get_or_create(
            code="CS502_OS",
            defaults={"name": "Operating Systems", "branch": "CSE", "semester": "5", "credits": 3}
        )

        # 3. Users
        # Admin
        self.admin_user, _ = User.objects.get_or_create(username="perf_admin", defaults={"is_staff": True})
        self.admin_user.set_password("adminpass")
        self.admin_user.save()
        UserProfile.objects.update_or_create(user=self.admin_user, defaults={"role": "admin"})

        # Teacher 1 (assigned to DBMS)
        self.teacher_user, _ = User.objects.get_or_create(username="perf_teacher_1")
        self.teacher_user.set_password("teachpass")
        self.teacher_user.save()
        UserProfile.objects.update_or_create(user=self.teacher_user, defaults={"role": "teacher"})

        # Assign teacher 1 to DBMS
        FacultyAssignment.objects.create(
            teacher=self.teacher_user,
            subject=self.sub_dbms,
            academic_class=self.academic_class
        )

        # Student 1
        self.student_1 = Student.objects.create(
            roll_no="STU-PERF-01",
            name="Alice Walker",
            email="alice@test.com",
            branch="CSE",
            year=3,
            semester="5",
            section="A",
            academic_class=self.academic_class,
        )

        # Student 2
        self.student_2 = Student.objects.create(
            roll_no="STU-PERF-02",
            name="Bob Smith",
            email="bob@test.com",
            branch="CSE",
            year=3,
            semester="5",
            section="A",
            academic_class=self.academic_class,
        )

    def test_teacher_save_marks_success_and_audit(self):
        """Assigned teacher can enter marks within bounds; generates AuditLog and Notification."""
        self.client.force_authenticate(user=self.teacher_user)
        payload = {
            "student_id": self.student_1.id,
            "subject_id": self.sub_dbms.id,
            "internals": 35.0,
            "end_sem": 55.0
        }
        response = self.client.post('/api/performance/marks/save/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("Score saved successfully", response.data["message"])

        # Check DB
        score = StudentScore.objects.get(student=self.student_1, subject=self.sub_dbms)
        self.assertEqual(score.internals, 35.0)
        self.assertEqual(score.end_sem, 55.0)
        self.assertEqual(score.total, 90.0)
        self.assertEqual(score.grade, "A+")
        self.assertEqual(score.grade_point, 10.0)

        # Check AuditLog
        audit = AuditLog.objects.filter(action="MARKS_UPDATE", entity_id=score.id).first()
        self.assertIsNotNone(audit)
        self.assertIn("Alice Walker", audit.description)
        self.assertIn("CS501_DBMS", audit.description)

        # Check Notification created for student_1's user
        student_user = self.student_1.user_profile.user
        notif = Notification.objects.filter(user=student_user, notification_type='marks').first()
        self.assertIsNotNone(notif)
        self.assertIn("CS501_DBMS", notif.title)
        self.assertIn("90.0/100", notif.message)

    def test_marks_bounds_validation(self):
        """Internals > 40 or End Sem > 60 or negative marks must be rejected with 400 Bad Request."""
        self.client.force_authenticate(user=self.teacher_user)

        # Internals > 40
        res = self.client.post('/api/performance/marks/save/', {
            "student_id": self.student_1.id,
            "subject_id": self.sub_dbms.id,
            "internals": 45.0,
            "end_sem": 50.0
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("between 0 and 40", res.data["detail"])

        # End Sem > 60
        res = self.client.post('/api/performance/marks/save/', {
            "student_id": self.student_1.id,
            "subject_id": self.sub_dbms.id,
            "internals": 30.0,
            "end_sem": 65.0
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("between 0 and 60", res.data["detail"])

        # Negative marks
        res = self.client.post('/api/performance/marks/save/', {
            "student_id": self.student_1.id,
            "subject_id": self.sub_dbms.id,
            "internals": -5.0,
            "end_sem": 50.0
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_faculty_assignment_authorization(self):
        """Teacher cannot enter marks for subjects they are not assigned to."""
        self.client.force_authenticate(user=self.teacher_user)

        # Attempt to mark OS (which teacher is not assigned to)
        res = self.client.post('/api/performance/marks/save/', {
            "student_id": self.student_1.id,
            "subject_id": self.sub_os.id,
            "internals": 30.0,
            "end_sem": 50.0
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("not assigned to evaluate marks", res.data["detail"])

        # Admin can enter marks for any subject
        self.client.force_authenticate(user=self.admin_user)
        res_admin = self.client.post('/api/performance/marks/save/', {
            "student_id": self.student_1.id,
            "subject_id": self.sub_os.id,
            "internals": 30.0,
            "end_sem": 50.0
        }, format='json')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)

    def test_student_report_card_isolation(self):
        """Students can only view their own report card; forbidden from viewing others."""
        # Create a score for student 1
        StudentScore.objects.create(
            student=self.student_1,
            subject=self.sub_dbms,
            internals=35.0,
            end_sem=55.0
        )

        # Authenticate as student 1 -> accessing own report card succeeds
        student_1_user = self.student_1.user_profile.user
        self.client.force_authenticate(user=student_1_user)
        res = self.client.get(f'/api/performance/student/{self.student_1.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["name"], "Alice Walker")
        self.assertEqual(len(res.data["subjects"]), 1)
        self.assertEqual(res.data["sgpa"], 10.0)

        # Student 1 trying to access student 2's report card -> 403 Forbidden
        res_forbidden = self.client.get(f'/api/performance/student/{self.student_2.id}/')
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # Student 1 using direct /my/ endpoint
        res_my = self.client.get('/api/performance/my/')
        self.assertEqual(res_my.status_code, status.HTTP_200_OK)
        self.assertEqual(res_my.data["student_id"], self.student_1.id)

    def test_list_student_scores_filtering(self):
        """Admin/Teacher can list and filter student scores with SGPA and grades."""
        self.client.force_authenticate(user=self.admin_user)

        res = self.client.get('/api/performance/?branch=CSE&section=A')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.data) >= 2)
        names = [s["name"] for s in res.data]
        self.assertIn("Alice Walker", names)
        self.assertIn("Bob Smith", names)
