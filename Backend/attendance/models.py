import secrets
from datetime import date, timedelta
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from students.models import Student


class AttendanceSession(models.Model):
    subject = models.ForeignKey(
        'performance.Subject',
        on_delete=models.CASCADE,
        related_name='attendance_sessions'
    )
    teacher = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='conducted_sessions'
    )
    academic_class = models.ForeignKey(
        'students.AcademicClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attendance_sessions'
    )
    section = models.CharField(max_length=10, default='A', blank=True)
    date = models.DateField(default=date.today)
    start_time = models.TimeField(auto_now_add=True)
    end_time = models.TimeField(null=True, blank=True)
    qr_token = models.CharField(max_length=120, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    duration_seconds = models.IntegerField(default=60)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    @classmethod
    def create_session(cls, subject, teacher, duration_seconds=60, academic_class=None, section='A'):
        token = secrets.token_urlsafe(32)
        now = timezone.now()
        expires = now + timedelta(seconds=duration_seconds)
        return cls.objects.create(
            subject=subject,
            teacher=teacher,
            qr_token=token,
            expires_at=expires,
            duration_seconds=duration_seconds,
            academic_class=academic_class,
            section=section,
            is_active=True
        )

    def refresh_token(self, duration_seconds=None):
        dur = duration_seconds or self.duration_seconds or 60
        self.qr_token = secrets.token_urlsafe(32)
        self.expires_at = timezone.now() + timedelta(seconds=dur)
        self.is_active = True
        self.save(update_fields=['qr_token', 'expires_at', 'is_active'])
        return self.qr_token

    def is_expired(self):
        return timezone.now() > self.expires_at

    def close(self):
        self.is_active = False
        self.end_time = timezone.now().time()
        self.save(update_fields=['is_active', 'end_time'])

    def __str__(self):
        return f"{self.subject.code} Session ({self.date}) by {self.teacher.username}"


class AttendanceRecord(models.Model):
    STATUS_CHOICES = (
        ('Present', 'Present'),
        ('Absent', 'Absent'),
        ('Late', 'Late'),
    )

    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name='attendance_records'
    )
    session = models.ForeignKey(
        AttendanceSession,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='records'
    )
    subject = models.ForeignKey(
        'performance.Subject',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attendance_records'
    )
    date = models.DateField(default=date.today)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='Present')
    marked_via = models.CharField(
        max_length=20,
        default='MANUAL',
        choices=(('QR', 'QR Code'), ('MANUAL', 'Teacher Manual Entry'))
    )
    remarks = models.CharField(max_length=200, blank=True, default='')
    marked_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Prevent student from marking twice for the exact same session
        # In MySQL, UNIQUE (student, session) permits multiple NULL sessions (for manual entries)
        # while strictly enforcing uniqueness when session is set.
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'session'],
                name='unique_student_session_attendance'
            ),
        ]
        ordering = ['-date', '-marked_at']

    def __str__(self):
        sub_code = self.subject.code if self.subject else 'General'
        return f"{self.student.name} - {sub_code} ({self.date}): {self.status}"
