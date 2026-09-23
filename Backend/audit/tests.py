from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from audit.models import AuditLog
from accounts.models import UserProfile
from students.models import Student, Department, Branch, AcademicClass


class AuditLogWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Create Admin
        self.admin_user = User.objects.create_superuser(
            username='admin_audit',
            email='admin@university.edu',
            password='Password123!'
        )
        UserProfile.objects.create(user=self.admin_user, role='admin')

        # Create Teacher
        self.teacher_user = User.objects.create_user(
            username='teacher_audit',
            email='teacher@university.edu',
            password='Password123!'
        )
        UserProfile.objects.create(user=self.teacher_user, role='teacher')

        # Create Student User
        self.student_user = User.objects.create_user(
            username='student_audit',
            email='student@university.edu',
            password='Password123!'
        )
        UserProfile.objects.create(user=self.student_user, role='student')

        # Academic hierarchy
        self.dept = Department.objects.create(name='Computer Science and Engineering', code='CSE')
        self.branch = Branch.objects.create(department=self.dept, name='Computer Science', code='CSE')
        self.academic_class = AcademicClass.objects.create(
            branch=self.branch,
            year=3,
            semester=1,
            section='A'
        )

    def test_audit_log_helper_and_ip_extraction(self):
        """Verifies AuditLog.log helper logs action and IP accurately."""
        class MockRequest:
            META = {'HTTP_X_FORWARDED_FOR': '192.168.1.100, 10.0.0.1'}
            user = self.admin_user

        log = AuditLog.log(
            action='LOGIN',
            entity='User',
            entity_id=str(self.admin_user.id),
            description='Admin logged in successfully.',
            request=MockRequest()
        )

        self.assertEqual(log.action, 'LOGIN')
        self.assertEqual(log.entity, 'User')
        self.assertEqual(log.user, self.admin_user)
        self.assertEqual(log.ip_address, '192.168.1.100')
        self.assertIn('LOGIN', str(log))

    def test_admin_can_access_audit_logs_with_pagination(self):
        """Admin can retrieve audit logs with backend pagination."""
        for i in range(30):
            AuditLog.objects.create(
                user=self.admin_user,
                action='STUDENT_UPDATE',
                entity='Student',
                entity_id=str(i),
                description=f'Student record #{i} updated by admin.',
                ip_address='127.0.0.1'
            )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/audit/logs/?page=1&page_size=10')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertGreaterEqual(data['total'], 30)
        self.assertEqual(data['page'], 1)
        self.assertEqual(data['page_size'], 10)
        self.assertEqual(len(data['results']), 10)
        self.assertTrue(data['has_next'])
        self.assertFalse(data['has_previous'])

        # Page 2
        response_p2 = self.client.get('/api/audit/logs/?page=2&page_size=10')
        self.assertEqual(response_p2.status_code, status.HTTP_200_OK)
        self.assertEqual(response_p2.data['page'], 2)
        self.assertTrue(response_p2.data['has_previous'])

    def test_teacher_and_student_forbidden_from_audit_logs(self):
        """Teachers and students cannot access system audit logs."""
        AuditLog.objects.create(
            user=self.admin_user,
            action='LOGIN',
            entity='User',
            description='Admin session'
        )

        # Teacher forbidden
        self.client.force_authenticate(user=self.teacher_user)
        res_teacher = self.client.get('/api/audit/logs/')
        self.assertEqual(res_teacher.status_code, status.HTTP_403_FORBIDDEN)

        # Student forbidden
        self.client.force_authenticate(user=self.student_user)
        res_student = self.client.get('/api/audit/logs/')
        self.assertEqual(res_student.status_code, status.HTTP_403_FORBIDDEN)

        # Unauthenticated unauthorized
        self.client.logout()
        res_anon = self.client.get('/api/audit/logs/')
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_filter_and_search_audit_logs(self):
        """Admin can filter audit logs by action, entity, and keyword search."""
        AuditLog.objects.create(
            user=self.admin_user,
            action='MARKS_UPDATE',
            entity='StudentScore',
            entity_id='101',
            description='Faculty updated DBMS mid-term marks for Roll STU-001.'
        )
        AuditLog.objects.create(
            user=self.admin_user,
            action='ANNOUNCEMENT_CREATE',
            entity='Announcement',
            entity_id='55',
            description='Published end-semester examination guidelines.'
        )

        self.client.force_authenticate(user=self.admin_user)

        # Action filter
        res_action = self.client.get('/api/audit/logs/?action=MARKS_UPDATE')
        self.assertEqual(res_action.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_action.data['results']), 1)
        self.assertEqual(res_action.data['results'][0]['action'], 'MARKS_UPDATE')

        # Keyword search
        res_search = self.client.get('/api/audit/logs/?search=examination')
        self.assertEqual(res_search.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_search.data['results']), 1)
        self.assertEqual(res_search.data['results'][0]['action'], 'ANNOUNCEMENT_CREATE')

    def test_audit_stats_endpoint(self):
        """Admin can retrieve operational summary statistics."""
        AuditLog.objects.create(
            user=self.admin_user,
            action='LOGIN',
            entity='User',
            description='Admin session'
        )
        AuditLog.objects.create(
            user=self.admin_user,
            action='STUDENT_CREATE',
            entity='Student',
            description='Student enrolled'
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get('/api/audit/stats/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertGreaterEqual(data['total_logs'], 2)
        self.assertGreaterEqual(data['today_logs'], 2)
        self.assertIn('action_breakdown', data)
        self.assertGreaterEqual(data['auth_events_count'], 1)
        self.assertGreaterEqual(data['academic_events_count'], 1)

    def test_student_lifecycle_triggers_automatic_audit_log(self):
        """Creating, updating, and deactivating a student records audit events."""
        self.client.force_authenticate(user=self.admin_user)

        # 1. Create Student
        create_payload = {
            'name': 'Audit Test Student',
            'roll_no': 'CSE-AUD-001',
            'email': 'audit_student@univ.edu',
            'phone': '9876543210',
            'branch': 'CSE',
            'year': 3,
            'semester': 1,
            'section': 'A'
        }
        res_create = self.client.post('/api/students/', create_payload, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        student_id = res_create.data['id']

        # Verify audit log for creation
        create_log = AuditLog.objects.filter(action='STUDENT_CREATE', entity='Student', entity_id=str(student_id)).first()
        self.assertIsNotNone(create_log)
        self.assertIn('Audit Test Student', create_log.description)

        # 2. Deactivate Student
        res_deact = self.client.post(f'/api/students/{student_id}/deactivate/')
        self.assertEqual(res_deact.status_code, status.HTTP_200_OK)

        # Verify audit log for deactivation
        deact_log = AuditLog.objects.filter(action='STUDENT_DEACTIVATE', entity='Student', entity_id=str(student_id)).first()
        self.assertIsNotNone(deact_log)
        self.assertIn('deactivated', deact_log.description)

    def test_sensitive_credentials_never_stored_in_audit_logs(self):
        """Verifies no passwords, tokens, or private secrets leak into audit logs."""
        all_logs = AuditLog.objects.all()
        for log in all_logs:
            desc_lower = log.description.lower()
            self.assertNotIn('password123', desc_lower)
            self.assertNotIn('secret', desc_lower)
            self.assertNotIn('token:', desc_lower)
