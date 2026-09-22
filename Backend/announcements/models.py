from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Announcement(models.Model):
    PRIORITY_CHOICES = (
        ('Normal', 'Normal'),
        ('Important', 'Important'),
        ('Urgent', 'Urgent'),
    )

    title = models.CharField(max_length=200)
    description = models.TextField()
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='announcements')
    department = models.CharField(max_length=100, default='All')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='Normal')
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
        return f"[{self.priority}] {self.title} ({self.department})"
