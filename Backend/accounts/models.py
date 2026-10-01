import secrets
from datetime import timedelta
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from students.models import Student


class UserProfile(models.Model):
    ROLE_CHOICES = (
        ('teacher', 'Teacher/Faculty'),
        ('student', 'Student'),
        ('admin', 'System Administrator'),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='teacher')
    student = models.OneToOneField(
        Student, on_delete=models.SET_NULL, null=True, blank=True, related_name='user_profile'
    )
    phone = models.CharField(max_length=30, blank=True, default='')
    department = models.CharField(max_length=100, blank=True, default='Academic Operations')
    employee_id = models.CharField(max_length=50, blank=True, null=True, unique=True)
    profile_pic = models.TextField(blank=True, default='')

    # Security & Account Activation
    is_activated = models.BooleanField(
        default=True,
        help_text="Whether this account has been activated with a user-chosen secure password."
    )
    activation_token = models.CharField(max_length=128, blank=True, null=True, unique=True, db_index=True)
    activation_token_expires_at = models.DateTimeField(null=True, blank=True)
    must_change_password = models.BooleanField(
        default=False,
        help_text="Requires user to change password on next authenticated session."
    )

    def generate_activation_token(self, hours=168):
        """
        Generate a cryptographically secure URL-safe activation token (valid for 7 days by default).
        """
        self.activation_token = secrets.token_urlsafe(32)
        self.activation_token_expires_at = timezone.now() + timedelta(hours=hours)
        self.is_activated = False
        self.save(update_fields=['activation_token', 'activation_token_expires_at', 'is_activated'])
        return self.activation_token

    def is_activation_token_valid(self, token):
        if not self.activation_token or not token:
            return False
        if not secrets.compare_digest(self.activation_token, token.strip()):
            return False
        if self.activation_token_expires_at and timezone.now() > self.activation_token_expires_at:
            return False
        return True

    @property
    def user_id_code(self):
        if self.employee_id:
            return self.employee_id
        if self.role == 'student' and self.student:
            return self.student.student_id or self.student.roll_no or f"STU-{self.user_id:03d}"
        elif self.role == 'teacher':
            return f"TCH-{self.user_id:03d}"
        elif self.role == 'admin':
            return f"ADM-{self.user_id:03d}"
        return f"USR-{self.user_id:03d}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.employee_id and self.user_id:
            if self.role == 'teacher':
                prefix = 'TCH'
            elif self.role == 'admin':
                prefix = 'ADM'
            elif self.role == 'student' and self.student and self.student.student_id:
                self.employee_id = self.student.student_id
                super().save(update_fields=['employee_id'])
                return
            else:
                prefix = 'STU'

            new_id = f"{prefix}-{self.user_id:03d}"
            counter = self.user_id
            while UserProfile.objects.filter(employee_id__iexact=new_id).exclude(pk=self.pk).exists():
                counter += 1
                new_id = f"{prefix}-{counter:03d}"
            self.employee_id = new_id
            super().save(update_fields=['employee_id'])

    def __str__(self):
        return f"{self.user.username} ({self.role}) [{self.user_id_code}]"


class LoginAttempt(models.Model):
    """
    Tracks failed login attempts by identifier and client IP to protect against brute-force attacks.
    """
    identifier = models.CharField(max_length=150, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True, db_index=True)
    failed_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_attempt_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-last_attempt_at']
        indexes = [
            models.Index(fields=['identifier', 'ip_address']),
        ]

    @classmethod
    def is_locked_out(cls, identifier, ip_address, max_attempts=5, lockout_minutes=15):
        """
        Check if this identifier or IP is currently locked out.
        Returns (is_locked, remaining_minutes)
        """
        now = timezone.now()
        q = models.Q()
        if identifier:
            q |= models.Q(identifier=identifier.lower())
        if ip_address:
            q |= models.Q(ip_address=ip_address)

        record = cls.objects.filter(q).filter(locked_until__gt=now).order_by('-locked_until').first()
        if record and record.locked_until:
            rem_secs = (record.locked_until - now).total_seconds()
            rem_mins = max(1, int(rem_secs // 60) + 1)
            return True, rem_mins
        return False, 0

    @classmethod
    def record_failure(cls, identifier, ip_address, max_attempts=5, lockout_minutes=15):
        """
        Record a failed attempt for this identifier & IP. Locks out if >= max_attempts.
        """
        now = timezone.now()
        ident = (identifier or '').strip().lower()
        record, _ = cls.objects.get_or_create(
            identifier=ident,
            ip_address=ip_address,
            defaults={'failed_attempts': 0}
        )
        record.failed_attempts += 1
        record.last_attempt_at = now

        if record.failed_attempts >= max_attempts:
            record.locked_until = now + timedelta(minutes=lockout_minutes)

        record.save(update_fields=['failed_attempts', 'locked_until', 'last_attempt_at'])
        return record.failed_attempts >= max_attempts

    @classmethod
    def record_success(cls, identifier, ip_address):
        """
        Reset failed attempts on successful login.
        """
        ident = (identifier or '').strip().lower()
        cls.objects.filter(models.Q(identifier=ident) | models.Q(ip_address=ip_address)).delete()


