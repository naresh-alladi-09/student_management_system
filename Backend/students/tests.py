import math
from datetime import date, timedelta
from django.utils import timezone
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import UserProfile
from students.models import Student
from performance.models import Subject, StudentScore, calculate_grade_and_points
from attendance.models import AttendanceSession, AttendanceRecord


class AcademicSystemSecurityAndCalculationsTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Setup Admin
        self.admin_user, _ = User.objects.get_or_create(
            username='sysadmin',
            defaults={'email': 'admin@test.com', 'is_staff': True, 'is_superuser': True}
        )
        self.admin_user.set_password('password123')
        self.admin_user.save()
        UserProfile.objects.update_or_create(user=self.admin_user, defaults={'role': 'admin'})

        # 2. Setup Teacher
        self.teacher_user, _ = User.objects.get_or_create(
            username='prof_smith',
            defaults={'email': 'smith@test.com'}
        )
        self.teacher_user.set_password('password123')
        self.teacher_user.save()
        UserProfile.objects.update_or_create(user=self.teacher_user, defaults={'role': 'teacher', 'department': 'CSE'})

        # 3. Setup Student A (auto-creates User and UserProfile in Student.save)
        self.student_a = Student.objects.create(
            name='Alice Student',
            roll_no='STU-2024-101',
            email='alice@test.com',
            phone='9876543211',
            branch='CSE',
            year=3,
            semester='5'
        )
        self.user_a = self.student_a.user_profile.user

        # 4. Setup Student B (auto-creates User and UserProfile in Student.save)
        self.student_b = Student.objects.create(
            name='Bob Student',
            roll_no='STU-2024-102',
            email='bob@test.com',
            phone='9876543212',
            branch='CSE',
            year=3,
            semester='5'
        )
        self.user_b = self.student_b.user_profile.user

        # 5. Curriculum Subject
        self.subject = Subject.objects.create(
            code='CS501',
            name='Data Structures & Algorithms',
            branch='CSE',
            semester='5',
            credits=4
        )

    # -----------------------------------------------------------------
    # 1. ROLE-BASED AUTHORIZATION & ISOLATION
    # -----------------------------------------------------------------
    def test_student_isolation_cannot_access_other_student_report(self):
        """Student A should receive 403 Forbidden when trying to access Student B's report card."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(f'/api/performance/student/{self.student_b.id}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_can_access_own_report(self):
        """Student A should successfully access their own report card."""
        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(f'/api/performance/student/{self.student_a.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_student_cannot_modify_marks(self):
        """Students must receive 403 Forbidden when trying to modify or enter marks."""
        self.client.force_authenticate(user=self.user_a)
        payload = {
            'student_id': self.student_a.id,
            'subject_id': self.subject.id,
            'internals': 35.0,
            'end_sem': 65.0
        }
        response = self.client.post('/api/performance/marks/save/', payload)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_can_enter_marks(self):
        """Faculty member should successfully record student marks."""
        self.client.force_authenticate(user=self.teacher_user)
        payload = {
            'student_id': self.student_a.id,
            'subject_id': self.subject.id,
            'internals': 28.0,
            'end_sem': 58.0
        }
        response = self.client.post('/api/performance/marks/save/', payload)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        score = StudentScore.objects.get(student=self.student_a, subject=self.subject)
        self.assertEqual(score.total, 86.0)
        self.assertEqual(score.grade, 'A')
        self.assertEqual(score.grade_point, 9.0)

    def test_teacher_cannot_access_admin_user_management(self):
        """Teacher cannot access admin-only endpoints like user provisioning."""
        self.client.force_authenticate(user=self.teacher_user)
        response = self.client.get('/api/auth/users/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # -----------------------------------------------------------------
    # 2. QR ATTENDANCE SYSTEM & DUPLICATE PREVENTION
    # -----------------------------------------------------------------
    def test_teacher_creates_qr_session(self):
        """Teacher launches a live attendance session with temporary secure token."""
        self.client.force_authenticate(user=self.teacher_user)
        response = self.client.post('/api/attendance/sessions/create/', {
            'subject_id': self.subject.id,
            'duration_seconds': 60
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('session', response.data)
        self.assertTrue(len(response.data['session']['qr_token']) > 20)

    def test_student_marks_qr_attendance_successfully(self):
        """Authenticated student successfully submits temporary QR token."""
        session = AttendanceSession.create_session(
            subject=self.subject,
            teacher=self.teacher_user,
            duration_seconds=60
        )
        self.client.force_authenticate(user=self.user_a)
        response = self.client.post('/api/attendance/mark-qr/', {
            'qr_token': session.qr_token
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'Present')
        self.assertTrue(AttendanceRecord.objects.filter(student=self.student_a, session=session).exists())

    def test_duplicate_attendance_prevented(self):
        """Same student attempting to mark attendance twice in the same session receives 409 Conflict."""
        session = AttendanceSession.create_session(
            subject=self.subject,
            teacher=self.teacher_user,
            duration_seconds=60
        )
        self.client.force_authenticate(user=self.user_a)
        # First submission
        res1 = self.client.post('/api/attendance/mark-qr/', {'qr_token': session.qr_token})
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # Duplicate submission attempt
        res2 = self.client.post('/api/attendance/mark-qr/', {'qr_token': session.qr_token})
        self.assertEqual(res2.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(res2.data.get('already_marked'))

    def test_expired_qr_token_rejected(self):
        """Expired QR token cannot be used to mark attendance."""
        session = AttendanceSession.objects.create(
            subject=self.subject,
            teacher=self.teacher_user,
            qr_token='expired_token_12345',
            expires_at=timezone.now() - timedelta(seconds=10),
            is_active=True
        )
        self.client.force_authenticate(user=self.user_a)
        response = self.client.post('/api/attendance/mark-qr/', {'qr_token': session.qr_token})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # -----------------------------------------------------------------
    # 3. ATTENDANCE SHORTAGE & RECOVERY CALCULATION
    # -----------------------------------------------------------------
    def test_attendance_shortage_calculation(self):
        """
        Verify real shortage calculation:
        If student attended 6 out of 10 classes (60%), attendance is below 75%.
        Classes needed = ceil(3*T - 4*P) = ceil(30 - 24) = 6 consecutive classes.
        """
        today = date.today()
        # Seed 10 classes: 6 Present, 4 Absent
        for i in range(10):
            st = 'Present' if i < 6 else 'Absent'
            AttendanceRecord.objects.create(
                student=self.student_a,
                subject=self.subject,
                date=today - timedelta(days=i),
                status=st
            )

        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(f'/api/attendance/student/{self.student_a.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['attendance_rate'], 60.0)
        self.assertTrue(response.data['shortage_warning'])
        # Needed to reach 75%: 6 more consecutive classes
        self.assertEqual(response.data['classes_needed_for_75'], 6)

    # -----------------------------------------------------------------
    # 4. ACADEMIC SGPA & CGPA FORMULA CALCULATION
    # -----------------------------------------------------------------
    def test_sgpa_cgpa_calculation(self):
        """
        Verify SGPA calculation:
        Subject 1 (4 credits): 85% -> Grade A (9 points) -> 36 credit points
        Subject 2 (3 credits): 75% -> Grade B+ (8 points) -> 24 credit points
        Total points = 60, Total credits = 7
        SGPA = 60 / 7 = 8.57
        """
        sub2 = Subject.objects.create(
            code='CS502', name='Databases', branch='CSE', semester='5', credits=3
        )
        StudentScore.objects.create(
            student=self.student_a, subject=self.subject, internals=25.0, end_sem=60.0
        )
        StudentScore.objects.create(
            student=self.student_a, subject=sub2, internals=20.0, end_sem=55.0
        )

        self.client.force_authenticate(user=self.user_a)
        response = self.client.get(f'/api/performance/student/{self.student_a.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['sgpa'], 8.57)
        self.assertEqual(response.data['cgpa'], 8.57)
        self.assertEqual(response.data['total_credits'], 7)

    # -----------------------------------------------------------------
    # 5. SOFT DELETION
    # -----------------------------------------------------------------
    def test_student_soft_deletion(self):
        """Deactivating a student sets is_active=False without deleting academic records."""
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.post(f'/api/students/{self.student_a.id}/deactivate/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.student_a.refresh_from_db()
        self.assertFalse(self.student_a.is_active)
        # Verify student still exists in DB
        self.assertTrue(Student.objects.filter(id=self.student_a.id).exists())
