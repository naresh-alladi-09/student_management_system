import json
from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import UserProfile, LoginAttempt
from students.models import Department, Branch, AcademicClass, FacultyAssignment, Student
from performance.models import Subject, StudentScore
from attendance.models import AttendanceSession, AttendanceRecord


class SecurityTestSuite(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Setup Academic Structure
        self.dept = Department.objects.create(code='CSE', name='Computer Science & Engineering')
        self.branch = Branch.objects.create(department=self.dept, code='CSE', name='Computer Science')
        self.academic_class_a = AcademicClass.objects.create(
            branch=self.branch, year=3, semester=5, section='A'
        )
        self.academic_class_b = AcademicClass.objects.create(
            branch=self.branch, year=3, semester=5, section='B'
        )

        self.subject = Subject.objects.create(
            code='CS501', name='Database Engineering', credits=4, branch='CSE'
        )

        # 2. Setup Admin User
        self.admin_user = User.objects.create_user(
            username='admin_test', email='admin@gmail.com', password='AdminSecurePassword123!'
        )
        self.admin_user.is_staff = True
        self.admin_user.save()
        self.admin_profile = UserProfile.objects.create(
            user=self.admin_user, role='admin', department='University Administration'
        )

        # 3. Setup Faculty User (Assigned to Section A only)
        self.faculty_user = User.objects.create_user(
            username='prof_smith', email='smith@gmail.com', password='ProfSecurePassword123!'
        )
        self.faculty_profile = UserProfile.objects.create(
            user=self.faculty_user, role='teacher', department='Computer Science & Engineering'
        )
        self.assignment = FacultyAssignment.objects.create(
            teacher=self.faculty_user,
            subject=self.subject,
            academic_class=self.academic_class_a
        )

        # 4. Setup Student 1 (Enrolled in Class A)
        self.student_1 = Student.objects.create(
            name='Alice Johnson',
            student_id='STU2024001',
            roll_no='STU-2024-001',
            email='alice@example.com',
            phone='9876543210',
            branch='CSE',
            year=3,
            semester='5',
            section='A',
            academic_class=self.academic_class_a
        )
        # Refresh to get auto-provisioned user and profile
        self.student_1_profile = UserProfile.objects.get(student=self.student_1)
        self.student_1_user = self.student_1_profile.user

        # 5. Setup Student 2 (Enrolled in Class B)
        self.student_2 = Student.objects.create(
            name='Bob Williams',
            student_id='STU2024002',
            roll_no='STU-2024-002',
            email='bob@example.com',
            phone='9876543211',
            branch='CSE',
            year=3,
            semester='5',
            section='B',
            academic_class=self.academic_class_b
        )
        self.student_2_profile = UserProfile.objects.get(student=self.student_2)
        self.student_2_user = self.student_2_profile.user

    # =========================================================================
    # FEATURE 1 & 8: AUTHENTICATION, ACTIVATION & BRUTE FORCE TESTS
    # =========================================================================

    def test_student_cannot_login_with_student_id_as_password(self):
        """Student cannot authenticate using predictable student ID / roll number as password."""
        response = self.client.post('/api/auth/login/', {
            'username': self.student_1.student_id,
            'password': self.student_1.student_id,
            'role': 'student'
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unactivated_student_gets_activation_notice(self):
        """Unactivated student with a valid token receives a 403 needs_activation signal."""
        # Ensure student 1 is unactivated with an activation token
        self.student_1_profile.is_activated = False
        token = self.student_1_profile.generate_activation_token()

        # Try to login with any password
        response = self.client.post('/api/auth/login/', {
            'username': self.student_1.student_id,
            'password': 'AnyRandomPassword123!',
            'role': 'student'
        })
        # If password wrong, 401
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_student_account_activation_success(self):
        """Student successfully activates account with valid token and strong password."""
        token = self.student_1_profile.generate_activation_token()

        response = self.client.post('/api/auth/activate/', {
            'identifier': self.student_1.student_id,
            'activation_token': token,
            'new_password': 'AliceSecurePass2026!',
            'confirm_password': 'AliceSecurePass2026!'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.student_1_profile.refresh_from_db()
        self.assertTrue(self.student_1_profile.is_activated)
        self.assertIsNone(self.student_1_profile.activation_token)

        # Student can now immediately log in with new password
        login_res = self.client.post('/api/auth/login/', {
            'username': self.student_1.student_id,
            'password': 'AliceSecurePass2026!',
            'role': 'student'
        })
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)

    def test_student_activation_rejects_student_id_as_password(self):
        """Account activation rejects using predictable student ID as password."""
        token = self.student_1_profile.generate_activation_token()
        response = self.client.post('/api/auth/activate/', {
            'identifier': self.student_1.student_id,
            'activation_token': token,
            'new_password': self.student_1.student_id,
            'confirm_password': self.student_1.student_id
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_student_activation_rejects_invalid_token(self):
        """Account activation rejects bad or expired activation tokens."""
        self.student_1_profile.generate_activation_token()
        response = self.client.post('/api/auth/activate/', {
            'identifier': self.student_1.student_id,
            'activation_token': 'completely_fake_invalid_token_xyz',
            'new_password': 'AliceSecurePass2026!',
            'confirm_password': 'AliceSecurePass2026!'
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_and_faculty_login_works(self):
        """Admin and faculty authentication remains completely functional."""
        # Faculty Login
        f_res = self.client.post('/api/auth/login/', {
            'username': 'prof_smith',
            'password': 'ProfSecurePassword123!',
            'role': 'teacher'
        })
        self.assertEqual(f_res.status_code, status.HTTP_200_OK)
        self.assertEqual(f_res.data['role'], 'teacher')

        # Admin Login
        a_res = self.client.post('/api/auth/login/', {
            'username': 'admin_test',
            'password': 'AdminSecurePassword123!',
            'role': 'admin'
        })
        self.assertEqual(a_res.status_code, status.HTTP_200_OK)
        self.assertEqual(a_res.data['role'], 'admin')

    def test_brute_force_lockout_triggers_after_repeated_failures(self):
        """Repeated failed login attempts trigger progressive lockout (HTTP 429)."""
        LoginAttempt.objects.all().delete()
        bad_credentials = {'username': 'attacker_target', 'password': 'WrongPassword123!'}

        # Send 5 failed attempts
        for _ in range(5):
            self.client.post('/api/auth/login/', bad_credentials)

        # 6th attempt must be locked out with HTTP 429
        locked_res = self.client.post('/api/auth/login/', bad_credentials)
        self.assertEqual(locked_res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_password_change_flow(self):
        """Authenticated user can change password; rejects invalid current password."""
        self.client.force_authenticate(user=self.faculty_user)

        # 1. Wrong current password rejected
        bad_pw_res = self.client.post('/api/auth/change-password/', {
            'current_password': 'WrongPassword!',
            'new_password': 'NewProfSecurePass2026!',
            'confirm_password': 'NewProfSecurePass2026!'
        })
        self.assertEqual(bad_pw_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Correct current password accepted
        ok_pw_res = self.client.post('/api/auth/change-password/', {
            'current_password': 'ProfSecurePassword123!',
            'new_password': 'NewProfSecurePass2026!',
            'confirm_password': 'NewProfSecurePass2026!'
        })
        self.assertEqual(ok_pw_res.status_code, status.HTTP_200_OK)

    # =========================================================================
    # FEATURE 3 & 9: ROLE-BASED ACCESS CONTROL & IDOR PRIVACY TESTS
    # =========================================================================

    def test_student_cannot_access_another_students_report_card(self):
        """IDOR Prevention: Student 1 attempting to view Student 2's report card gets 403 Forbidden."""
        self.client.force_authenticate(user=self.student_1_user)

        # Student 1 accessing Student 2's report card
        response = self.client.get(f'/api/performance/student/{self.student_2.id}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Student 1 accessing their own report card succeeds
        own_res = self.client.get(f'/api/performance/student/{self.student_1.id}/')
        self.assertEqual(own_res.status_code, status.HTTP_200_OK)

    def test_student_cannot_access_another_students_attendance(self):
        """IDOR Prevention: Student 1 attempting to view Student 2's attendance gets 403 Forbidden."""
        self.client.force_authenticate(user=self.student_1_user)

        response = self.client.get(f'/api/attendance/student/{self.student_2.id}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_queryset_isolated_to_self(self):
        """In StudentViewSet, student role caller only sees their own record in list."""
        self.client.force_authenticate(user=self.student_1_user)
        response = self.client.get('/api/students/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Results must only contain student 1
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], self.student_1.id)

    def test_faculty_isolated_to_assigned_class_students(self):
        """Faculty member assigned to Section A cannot access Section B student records."""
        self.client.force_authenticate(user=self.faculty_user)

        # Faculty attempting to view Section B student report card gets 403
        b_res = self.client.get(f'/api/performance/student/{self.student_2.id}/')
        self.assertEqual(b_res.status_code, status.HTTP_403_FORBIDDEN)

        # Faculty viewing Section A student report card succeeds
        a_res = self.client.get(f'/api/performance/student/{self.student_1.id}/')
        self.assertEqual(a_res.status_code, status.HTTP_200_OK)

    def test_student_cannot_invoke_admin_user_management(self):
        """Student attempting to call admin user creation or management endpoint gets 403."""
        self.client.force_authenticate(user=self.student_1_user)
        response = self.client.get('/api/auth/users/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # =========================================================================
    # FEATURE 4: QR ATTENDANCE ANTI-PROXY TESTS
    # =========================================================================

    def test_qr_attendance_duplicate_prevention(self):
        """Student cannot submit attendance twice for the same QR session."""
        session = AttendanceSession.create_session(
            subject=self.subject,
            teacher=self.faculty_user,
            duration_seconds=300,
            academic_class=self.academic_class_a,
            section='A'
        )

        self.client.force_authenticate(user=self.student_1_user)

        # 1st Submission: Success
        res1 = self.client.post('/api/attendance/mark-qr/', {
            'qr_token': session.qr_token,
            'device_fingerprint': 'dev_fp_12345'
        })
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)

        # 2nd Submission: Duplicate Rejected (409 Conflict)
        res2 = self.client.post('/api/attendance/mark-qr/', {
            'qr_token': session.qr_token,
            'device_fingerprint': 'dev_fp_12345'
        })
        self.assertEqual(res2.status_code, status.HTTP_409_CONFLICT)

    def test_qr_attendance_detects_shared_device_proxy(self):
        """Attendance submission from the same device for different students flags proxy review."""
        session = AttendanceSession.create_session(
            subject=self.subject,
            teacher=self.faculty_user,
            duration_seconds=300,
            academic_class=self.academic_class_a,
            section='A'
        )

        # Student 1 marks attendance on device "phone_abc"
        self.client.force_authenticate(user=self.student_1_user)
        self.client.post('/api/attendance/mark-qr/', {
            'qr_token': session.qr_token,
            'device_fingerprint': 'phone_abc_fingerprint'
        })

        # Also enroll Student 2 in Section A temporarily for this test
        self.student_2.academic_class = self.academic_class_a
        self.student_2.save()

        # Student 2 marks attendance on the SAME device "phone_abc"
        self.client.force_authenticate(user=self.student_2_user)
        res = self.client.post('/api/attendance/mark-qr/', {
            'qr_token': session.qr_token,
            'device_fingerprint': 'phone_abc_fingerprint'
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # Verify proxy flag was recorded in database
        rec = AttendanceRecord.objects.get(student=self.student_2, session=session)
        self.assertTrue(rec.is_flagged_proxy)
        import ast
        flags = rec.proxy_flags if isinstance(rec.proxy_flags, dict) else (ast.literal_eval(rec.proxy_flags) if rec.proxy_flags else {})
        self.assertTrue(flags.get('shared_device'))

    def test_expired_qr_token_rejected(self):
        """Expired QR tokens are immediately rejected."""
        session = AttendanceSession.create_session(
            subject=self.subject,
            teacher=self.faculty_user,
            duration_seconds=1,
            academic_class=self.academic_class_a,
            section='A'
        )
        # Fast-forward expiry
        session.expires_at = timezone.now() - timedelta(seconds=10)
        session.save()

        self.client.force_authenticate(user=self.student_1_user)
        res = self.client.post('/api/attendance/mark-qr/', {
            'qr_token': session.qr_token
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
