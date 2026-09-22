from django.db import models


class Student(models.Model):
    student_id = models.CharField(max_length=30, unique=True, null=True, blank=True)
    roll_no = models.CharField(max_length=30, unique=True, null=True, blank=True)
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20)
    date_of_birth = models.DateField(null=True, blank=True)
    department = models.CharField(max_length=100, blank=True, default='Engineering')
    branch = models.CharField(max_length=50, default='CSE')
    year = models.IntegerField(default=1)
    semester = models.CharField(max_length=10, default='1')
    admission_year = models.IntegerField(default=2024)
    profile_photo = models.CharField(max_length=255, blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        ordering = ['-id']
        indexes = [
            models.Index(fields=['roll_no']),
            models.Index(fields=['student_id']),
            models.Index(fields=['branch']),
            models.Index(fields=['is_active']),
        ]

    @property
    def roll_number(self):
        return self.roll_no

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)

        needs_update = False
        update_fields = []

        if not self.roll_no:
            self.roll_no = f"STU-2024-{self.id:03d}"
            needs_update = True
            update_fields.append('roll_no')

        if not self.student_id:
            adm_yr = self.admission_year or 2024
            self.student_id = f"STU{adm_yr}{self.id:04d}"
            needs_update = True
            update_fields.append('student_id')

        if not self.department and self.branch:
            branch_map = {
                'CSE': 'Computer Science & Engineering',
                'AIML': 'Artificial Intelligence & Machine Learning',
                'IT': 'Information Technology',
                'ECE': 'Electronics & Communication Engineering',
                'MECH': 'Mechanical Engineering',
                'CIVIL': 'Civil Engineering',
            }
            self.department = branch_map.get(self.branch.upper(), f"{self.branch} Department")
            needs_update = True
            update_fields.append('department')

        if needs_update:
            super().save(update_fields=update_fields)

        # Auto-provision or update student login account
        try:
            from django.contrib.auth.models import User
            from accounts.models import UserProfile
            uname = self.roll_no.lower().replace("-", "_")
            user, created = User.objects.get_or_create(
                username=uname,
                defaults={"email": self.email, "first_name": self.name}
            )
            if created or not user.has_usable_password():
                user.set_password("student123")
                user.save()
            user.is_active = self.is_active
            user.save(update_fields=['is_active'])

            UserProfile.objects.update_or_create(
                user=user,
                defaults={
                    "role": "student",
                    "student": self,
                    "phone": self.phone,
                    "department": self.department
                }
            )
        except Exception:
            pass

    def deactivate(self):
        self.is_active = False
        self.save(update_fields=['is_active'])
        if hasattr(self, 'user_profile') and self.user_profile.user:
            self.user_profile.user.is_active = False
            self.user_profile.user.save(update_fields=['is_active'])

    def activate(self):
        self.is_active = True
        self.save(update_fields=['is_active'])
        if hasattr(self, 'user_profile') and self.user_profile.user:
            self.user_profile.user.is_active = True
            self.user_profile.user.save(update_fields=['is_active'])

    def __str__(self):
        return f"{self.name} ({self.roll_no or self.id})"