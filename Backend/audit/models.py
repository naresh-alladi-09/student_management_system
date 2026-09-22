from django.db import models
from django.contrib.auth.models import User


class AuditLog(models.Model):
    ACTION_CHOICES = (
        ('LOGIN', 'User Login'),
        ('LOGOUT', 'User Logout'),
        ('STUDENT_CREATE', 'Student Created'),
        ('STUDENT_UPDATE', 'Student Updated'),
        ('STUDENT_DEACTIVATE', 'Student Deactivated'),
        ('STUDENT_ACTIVATE', 'Student Restored'),
        ('ATTENDANCE_SESSION_START', 'Attendance Session Started'),
        ('ATTENDANCE_QR_MARK', 'QR Attendance Marked'),
        ('ATTENDANCE_BULK_SAVE', 'Bulk Attendance Saved'),
        ('MARKS_UPDATE', 'Marks Updated'),
        ('ANNOUNCEMENT_CREATE', 'Announcement Created'),
        ('USER_CREATE', 'User Created'),
    )

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    action = models.CharField(max_length=40, choices=ACTION_CHOICES)
    entity = models.CharField(max_length=50)
    entity_id = models.CharField(max_length=50, blank=True, default='')
    description = models.TextField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']

    @classmethod
    def log(cls, action, entity, entity_id='', description='', user=None, request=None):
        ip = None
        if request:
            x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
            if x_forwarded_for:
                ip = x_forwarded_for.split(',')[0].strip()
            else:
                ip = request.META.get('REMOTE_ADDR')
            if not user and request.user and request.user.is_authenticated:
                user = request.user

        return cls.objects.create(
            user=user,
            action=action,
            entity=entity,
            entity_id=str(entity_id),
            description=description,
            ip_address=ip
        )

    def __str__(self):
        u = self.user.username if self.user else "System"
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M')}] {u}: {self.action} on {self.entity} ({self.entity_id})"
