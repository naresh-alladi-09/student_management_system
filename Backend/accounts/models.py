from django.db import models
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

    def __str__(self):
        return f"{self.user.username} ({self.role})"
