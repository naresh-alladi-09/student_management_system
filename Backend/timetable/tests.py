from datetime import time, date
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status

from accounts.models import UserProfile
from audit.models import AuditLog
from performance.models import Subject
from students.models import Department, Branch, AcademicClass, Student
from attendance.models import AttendanceSession
from timetable.models import TimetableSlot


class TimetableAPITests(APITestCase):
    def setUp(self):
        # Create department, branch, academic class
        self.dept, _ = Department.objects.get_or_create(name="Computer Science", code="CS")
        self.branch, _ = Branch.objects.get_or_create(name="Computer Science & Engineering", code="CSE", department=self.dept)
        self.academic_class, _ = AcademicClass.objects.get_or_create(
            branch=self.branch, year=3, semester=5, section="A"
        )

        # Subject
        self.subject, _ = Subject.objects.get_or_create(
            code="CS501", defaults={"name": "Database Systems", "credits": 4}
        )

        # Teacher User
        self.teacher_user, _ = User.objects.get_or_create(username="teacher_timetable", defaults={"first_name": "Alan", "last_name": "Turing"})
        self.teacher_user.set_password("pass123")
        self.teacher_user.save()
        UserProfile.objects.update_or_create(user=self.teacher_user, defaults={"role": "teacher"})

        # Another Teacher
        self.other_teacher, _ = User.objects.get_or_create(username="other_teacher")
        self.other_teacher.set_password("pass123")
        self.other_teacher.save()
        UserProfile.objects.update_or_create(user=self.other_teacher, defaults={"role": "teacher"})

        # Admin User
        self.admin_user, _ = User.objects.get_or_create(username="admin_timetable", defaults={"is_staff": True})
        self.admin_user.set_password("adminpass")
        self.admin_user.save()
        UserProfile.objects.update_or_create(user=self.admin_user, defaults={"role": "admin"})

        # Student Model (Student.save automatically creates User and UserProfile)
        self.student = Student.objects.create(
            roll_no="STU-TIME-01",
            name="Timetable Student",
            email="timestudent@test.com",
            branch="CSE",
            year=3,
            semester="5",
            section="A",
            academic_class=self.academic_class,
        )
        self.student_user = self.student.user_profile.user

        # Create sample Timetable Slot
        self.slot = TimetableSlot.objects.create(
            subject=self.subject,
            teacher=self.teacher_user,
            day="Monday",
            start_time=time(9, 0),
            end_time=time(10, 0),
            room="Room 301",
            branch="CSE",
            year=3,
            semester="5",
            section="A",
            academic_class=self.academic_class
        )

    def test_list_timetable_as_student(self):
        self.client.force_authenticate(user=self.student_user)
        response = self.client.get('/api/timetable/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) >= 1)
        self.assertEqual(response.data[0]['branch'], 'CSE')

    def test_get_today_timetable(self):
        self.client.force_authenticate(user=self.teacher_user)
        # Pass ?day=Monday to test specific schedule
        response = self.client.get('/api/timetable/today/?day=Monday')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['day'], 'Monday')
        self.assertTrue(response.data['count'] >= 1)
        slot_item = response.data['slots'][0]
        self.assertIn('has_active_session', slot_item)

    def test_start_attendance_from_slot_success(self):
        self.client.force_authenticate(user=self.teacher_user)
        response = self.client.post(f'/api/timetable/{self.slot.id}/start-attendance/', {
            'duration_seconds': 180,
            'ignore_time': True,
            'ignore_day': True,
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('token', response.data)
        self.assertIn('session_id', response.data)
        self.assertEqual(response.data['subject_code'], 'CS501')
        self.assertEqual(response.data['section'], 'A')

        # Verify session was created in DB
        session_id = response.data['session_id']
        session = AttendanceSession.objects.get(pk=session_id)
        self.assertEqual(session.teacher, self.teacher_user)
        self.assertEqual(session.academic_class, self.academic_class)
        self.assertEqual(session.section, 'A')

        # Verify AuditLog entry
        log_entry = AuditLog.objects.filter(action="ATTENDANCE_SESSION_START").first()
        self.assertIsNotNone(log_entry)

    def test_start_attendance_time_window_validation(self):
        from django.utils import timezone
        from datetime import timedelta
        self.client.force_authenticate(user=self.teacher_user)

        now = timezone.localtime()
        today_day = now.strftime('%A')

        # 1. Period in the future (not started yet)
        future_slot = TimetableSlot.objects.create(
            subject=self.subject,
            teacher=self.teacher_user,
            day=today_day,
            start_time=(now + timedelta(hours=2)).time(),
            end_time=(now + timedelta(hours=3)).time(),
            room="Room 401",
            branch="CSE",
            academic_class=self.academic_class
        )
        resp_future = self.client.post(f'/api/timetable/{future_slot.id}/start-attendance/')
        self.assertEqual(resp_future.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("scheduled from", resp_future.data['detail'])

        # 2. Period in the past (already ended)
        past_slot = TimetableSlot.objects.create(
            subject=self.subject,
            teacher=self.teacher_user,
            day=today_day,
            start_time=(now - timedelta(hours=3)).time(),
            end_time=(now - timedelta(hours=2)).time(),
            room="Room 402",
            branch="CSE",
            academic_class=self.academic_class
        )
        resp_past = self.client.post(f'/api/timetable/{past_slot.id}/start-attendance/')
        self.assertEqual(resp_past.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("concluded at", resp_past.data['detail'])

    def test_today_timetable_vanishing_of_completed_periods(self):
        from django.utils import timezone
        from datetime import timedelta
        self.client.force_authenticate(user=self.teacher_user)

        now = timezone.localtime()
        today_day = now.strftime('%A')

        # Create a past slot (concluded) and an upcoming slot
        concluded_slot = TimetableSlot.objects.create(
            subject=self.subject,
            teacher=self.teacher_user,
            day=today_day,
            start_time=(now - timedelta(hours=2)).time(),
            end_time=(now - timedelta(hours=1)).time(),
            room="Room 101",
            branch="CSE",
            academic_class=self.academic_class
        )
        upcoming_slot = TimetableSlot.objects.create(
            subject=self.subject,
            teacher=self.teacher_user,
            day=today_day,
            start_time=(now + timedelta(hours=1)).time(),
            end_time=(now + timedelta(hours=2)).time(),
            room="Room 102",
            branch="CSE",
            academic_class=self.academic_class
        )

        # Default query for today: completed slot vanishes!
        resp_default = self.client.get('/api/timetable/today/')
        self.assertEqual(resp_default.status_code, status.HTTP_200_OK)
        slot_ids = [s['id'] for s in resp_default.data['slots']]
        self.assertNotIn(concluded_slot.id, slot_ids, "Concluded period must vanish from active today's timetable")
        self.assertIn(upcoming_slot.id, slot_ids)

        # With ?all=true: completed slot is included
        resp_all = self.client.get('/api/timetable/today/?all=true')
        self.assertEqual(resp_all.status_code, status.HTTP_200_OK)
        all_ids = [s['id'] for s in resp_all.data['slots']]
        self.assertIn(concluded_slot.id, all_ids)
        self.assertIn(upcoming_slot.id, all_ids)

    def test_start_attendance_unauthorized_teacher_forbidden(self):
        # Another teacher tries to start attendance for Alan's slot
        self.client.force_authenticate(user=self.other_teacher)
        response = self.client.post(f'/api/timetable/{self.slot.id}/start-attendance/', {
            'ignore_time': True,
            'ignore_day': True,
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_and_manage_timetable_slot(self):
        self.client.force_authenticate(user=self.admin_user)
        create_resp = self.client.post('/api/timetable/create/', {
            'subject': self.subject.id,
            'teacher': self.teacher_user.id,
            'day': 'Tuesday',
            'start_time': '10:00:00',
            'end_time': '11:00:00',
            'room': 'Lab 2',
            'branch': 'CSE',
            'year': 3,
            'semester': '5',
            'section': 'A'
        })
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        slot_id = create_resp.data['id']
        self.assertEqual(create_resp.data['room'], 'Lab 2')

        # Update slot
        update_resp = self.client.patch(f'/api/timetable/{slot_id}/', {
            'room': 'Lab 3 (Renovated)'
        })
        self.assertEqual(update_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(update_resp.data['room'], 'Lab 3 (Renovated)')

        # Delete slot
        del_resp = self.client.delete(f'/api/timetable/{slot_id}/')
        self.assertEqual(del_resp.status_code, status.HTTP_200_OK)
        self.assertFalse(TimetableSlot.objects.filter(pk=slot_id).exists())
