from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Announcement(models.Model):
    PRIORITY_CHOICES = (
        ('Normal', 'Normal'),
        ('Important', 'Important'),
        ('Urgent', 'Urgent'),
    )

    AUDIENCE_CHOICES = (
        ('ALL', 'All Students'),
        ('BRANCH', 'Branch / Department'),
        ('YEAR', 'Academic Year'),
        ('SEMESTER', 'Semester'),
        ('SECTION', 'Section'),
        ('CLASS', 'Specific Cohort / Class'),
    )

    title = models.CharField(max_length=200)
    description = models.TextField()
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='announcements')
    department = models.CharField(max_length=100, default='All')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='Normal')
    target_audience = models.CharField(max_length=20, choices=AUDIENCE_CHOICES, default='ALL')
    branch = models.CharField(max_length=50, blank=True, default='')
    year = models.IntegerField(null=True, blank=True)
    semester = models.CharField(max_length=10, blank=True, default='')
    section = models.CharField(max_length=10, blank=True, default='')
    academic_class = models.ForeignKey(
        'students.AcademicClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='announcements'
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def is_expired(self):
        if self.expires_at:
            return timezone.now() > self.expires_at
        return False

    def __str__(self):
        return f"[{self.priority}] {self.title} (Audience: {self.target_audience})"

