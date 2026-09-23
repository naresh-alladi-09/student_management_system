from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status

from accounts.models import UserProfile
from students.models import Department, Branch, AcademicClass, Student
from announcements.models import Announcement
from notifications.models import Notification
from audit.models import AuditLog


class AnnouncementAndNotificationTests(APITestCase):
    def setUp(self):
        # 1. Academic Hierarchy
        self.dept_cs, _ = Department.objects.get_or_create(name="Computer Science", code="CS_ANN")
        self.dept_ec, _ = Department.objects.get_or_create(name="Electronics", code="EC_ANN")

        self.branch_cse, _ = Branch.objects.get_or_create(name="CSE Branch", code="CSE", department=self.dept_cs)
        self.branch_ece, _ = Branch.objects.get_or_create(name="ECE Branch", code="ECE", department=self.dept_ec)

        self.class_cse_3a, _ = AcademicClass.objects.get_or_create(
            branch=self.branch_cse, year=3, semester=5, section="A"
        )
        self.class_cse_3b, _ = AcademicClass.objects.get_or_create(
            branch=self.branch_cse, year=3, semester=5, section="B"
        )

        # 2. Users
        # Admin
        self.admin_user, _ = User.objects.get_or_create(username="ann_admin", defaults={"is_staff": True})
        self.admin_user.set_password("adminpass")
        self.admin_user.save()
        UserProfile.objects.update_or_create(user=self.admin_user, defaults={"role": "admin"})

        # Teacher
        self.teacher_user, _ = User.objects.get_or_create(username="ann_teacher")
        self.teacher_user.set_password("teachpass")
        self.teacher_user.save()
        UserProfile.objects.update_or_create(user=self.teacher_user, defaults={"role": "teacher"})

        # Student CSE Section A
        self.student_cse_a = Student.objects.create(
            roll_no="STU-ANN-01",
            name="Charlie CSE",
            email="charlie@test.com",
            branch="CSE",
            year=3,
            semester="5",
            section="A",
            academic_class=self.class_cse_3a,
        )

        # Student CSE Section B
        self.student_cse_b = Student.objects.create(
            roll_no="STU-ANN-02",
            name="Diana CSE",
            email="diana@test.com",
            branch="CSE",
            year=3,
            semester="5",
            section="B",
            academic_class=self.class_cse_3b,
        )

        # Student ECE
        self.student_ece = Student.objects.create(
            roll_no="STU-ANN-03",
            name="Evan ECE",
            email="evan@test.com",
            branch="ECE",
            year=1,
            semester="1",
            section="A",
        )

    def test_targeted_announcement_visibility(self):
        """Students only see announcements targeted to ALL, their branch, their year, or their section."""
        # 1. Global Announcement
        Announcement.objects.create(
            title="Global Campus Holiday",
            description="College closed on Monday.",
            created_by=self.admin_user,
            target_audience="ALL"
        )

        # 2. Branch Announcement (CSE only)
        Announcement.objects.create(
            title="CSE Hackathon 2026",
            description="Hackathon for all CSE students.",
            created_by=self.teacher_user,
            target_audience="BRANCH",
            branch="CSE"
        )

        # 3. Section Announcement (CSE Sec A only)
        Announcement.objects.create(
            title="CSE-3A Lab Rescheduled",
            description="Lab moved to Room 402.",
            created_by=self.teacher_user,
            target_audience="SECTION",
            branch="CSE",
            section="A"
        )

        # Test Student CSE Sec A: should see all 3
        self.client.force_authenticate(user=self.student_cse_a.user_profile.user)
        res_a = self.client.get('/api/announcements/')
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        titles_a = [a['title'] for a in res_a.data]
        self.assertIn("Global Campus Holiday", titles_a)
        self.assertIn("CSE Hackathon 2026", titles_a)
        self.assertIn("CSE-3A Lab Rescheduled", titles_a)

        # Test Student CSE Sec B: should see Global + CSE Hackathon, but NOT Sec A Lab Rescheduled
        self.client.force_authenticate(user=self.student_cse_b.user_profile.user)
        res_b = self.client.get('/api/announcements/')
        self.assertEqual(res_b.status_code, status.HTTP_200_OK)
        titles_b = [a['title'] for a in res_b.data]
        self.assertIn("Global Campus Holiday", titles_b)
        self.assertIn("CSE Hackathon 2026", titles_b)
        self.assertNotIn("CSE-3A Lab Rescheduled", titles_b)

        # Test Student ECE: should ONLY see Global Campus Holiday
        self.client.force_authenticate(user=self.student_ece.user_profile.user)
        res_ece = self.client.get('/api/announcements/')
        self.assertEqual(res_ece.status_code, status.HTTP_200_OK)
        titles_ece = [a['title'] for a in res_ece.data]
        self.assertIn("Global Campus Holiday", titles_ece)
        self.assertNotIn("CSE Hackathon 2026", titles_ece)
        self.assertNotIn("CSE-3A Lab Rescheduled", titles_ece)

    def test_create_announcement_generates_notifications_and_audit(self):
        """Teacher publishing an announcement generates in-app notifications and AuditLog."""
        self.client.force_authenticate(user=self.teacher_user)
        payload = {
            "title": "Semester Exam Timetable Released",
            "description": "Exams start on the 15th of next month.",
            "priority": "Important",
            "target_audience": "BRANCH",
            "branch": "CSE"
        }
        res = self.client.post('/api/announcements/create/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        ann_id = res.data["id"]

        # AuditLog entry
        audit = AuditLog.objects.filter(action="ANNOUNCEMENT_CREATE", entity_id=ann_id).first()
        self.assertIsNotNone(audit)
        self.assertIn("Semester Exam Timetable Released", audit.description)

        # In-App Notifications for CSE students
        notif_a = Notification.objects.filter(
            user=self.student_cse_a.user_profile.user,
            title__contains="Semester Exam Timetable Released"
        ).first()
        self.assertIsNotNone(notif_a)

        notif_b = Notification.objects.filter(
            user=self.student_cse_b.user_profile.user,
            title__contains="Semester Exam Timetable Released"
        ).first()
        self.assertIsNotNone(notif_b)

        # ECE student should NOT have received this notification
        notif_ece = Notification.objects.filter(
            user=self.student_ece.user_profile.user,
            title__contains="Semester Exam Timetable Released"
        ).first()
        self.assertIsNone(notif_ece)

    def test_student_notifications_and_read_state(self):
        """Student can view their notifications, see unread count, and mark them as read."""
        user = self.student_cse_a.user_profile.user
        Notification.objects.create(
            user=user,
            title="Welcome to Semester 5",
            message="Please verify your course registrations.",
            notification_type="general",
            is_read=False
        )
        Notification.objects.create(
            user=user,
            title="Attendance Shortage Alert",
            message="Your attendance is below 75%.",
            notification_type="attendance",
            is_read=False
        )

        self.client.force_authenticate(user=user)
        res = self.client.get('/api/notifications/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["unread_count"], 2)
        self.assertEqual(len(res.data["notifications"]), 2)

        # Mark all as read
        res_read = self.client.post('/api/notifications/read/')
        self.assertEqual(res_read.status_code, status.HTTP_200_OK)

        # Verify unread count is now 0
        res_after = self.client.get('/api/notifications/')
        self.assertEqual(res_after.data["unread_count"], 0)
        self.assertTrue(all(n["is_read"] for n in res_after.data["notifications"]))

    def test_student_cannot_create_announcements(self):
        """Students must not be authorized to create announcements."""
        self.client.force_authenticate(user=self.student_cse_a.user_profile.user)
        res = self.client.post('/api/announcements/create/', {
            "title": "Unauthorized Notice",
            "description": "This should fail.",
            "target_audience": "ALL"
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
