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
    employee_id = models.CharField(max_length=50, blank=True, null=True, unique=True)
    profile_pic = models.TextField(blank=True, default='')

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

