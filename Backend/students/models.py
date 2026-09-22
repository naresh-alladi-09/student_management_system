from django.db import models


class Student(models.Model):
    name = models.CharField(max_length=100)
    roll_no = models.CharField(max_length=20, unique=True, null=True, blank=True)
    year = models.IntegerField(default=1)
    email = models.EmailField()
    phone = models.CharField(max_length=15)
    branch = models.CharField(max_length=50)
    semester = models.CharField(max_length=10)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        ordering = ['-id']

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if not self.roll_no:
            self.roll_no = f"STU-2024-{self.id:03d}"
            super().save(update_fields=['roll_no'])

        # Auto-provision student login account
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
            UserProfile.objects.update_or_create(
                user=user,
                defaults={"role": "student", "student": self, "phone": self.phone}
            )
        except Exception:
            pass

    def __str__(self):
        return f"{self.name} ({self.roll_no or self.id})"