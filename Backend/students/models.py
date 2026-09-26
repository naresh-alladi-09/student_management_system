from django.db import models
from django.contrib.auth.models import User


class Department(models.Model):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f"{self.code} - {self.name}"


class Branch(models.Model):
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='branches')
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f"{self.code} ({self.department.code})"


class AcademicClass(models.Model):
    """
    Represents an institutional cohort: Branch -> Year -> Semester -> Section
    Example: CSE -> 3rd Year -> Semester 1 -> Section A
    """
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name='classes')
    year = models.IntegerField(default=1)  # 1 to 4
    semester = models.IntegerField(default=1)  # 1 to 8
    section = models.CharField(max_length=10, default='A')  # 'A', 'B', 'C'
    academic_year = models.CharField(max_length=20, default='2024-2025', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['branch', 'year', 'semester', 'section']
        constraints = [
            models.UniqueConstraint(
                fields=['branch', 'year', 'semester', 'section'],
                name='unique_branch_year_sem_section'
            )
        ]

    @property
    def display_name(self):
        return f"{self.branch.code} - Year {self.year}, Sem {self.semester} (Sec {self.section})"

    def __str__(self):
        return f"{self.branch.code} Y{self.year}S{self.semester}-{self.section}"


class FacultyAssignment(models.Model):
    """
    Associates a Teacher with the Subject and Section (AcademicClass) they are authorized to teach.
    """
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='faculty_assignments')
    subject = models.ForeignKey('performance.Subject', on_delete=models.CASCADE, related_name='faculty_assignments')
    academic_class = models.ForeignKey(AcademicClass, on_delete=models.CASCADE, related_name='faculty_assignments')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['academic_class', 'subject']
        constraints = [
            models.UniqueConstraint(
                fields=['teacher', 'subject', 'academic_class'],
                name='unique_teacher_subject_class'
            )
        ]

    def __str__(self):
        return f"{self.teacher.username} -> {self.subject.code} ({self.academic_class})"


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
    section = models.CharField(max_length=10, default='A')
    academic_class = models.ForeignKey(
        AcademicClass,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='students'
    )
    admission_year = models.IntegerField(default=2024)
    parent_name = models.CharField(max_length=100, blank=True, default='')
    parent_email = models.EmailField(blank=True, default='')
    parent_phone = models.CharField(max_length=20, blank=True, default='')
    profile_photo = models.TextField(blank=True, default='')
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

        # Auto-link to relational AcademicClass hierarchy
        if not self.academic_class and self.branch:
            try:
                dept_code = self.branch.upper()
                dept_name = self.department or f"{self.branch} Department"
                dept, _ = Department.objects.get_or_create(
                    code=dept_code,
                    defaults={'name': dept_name}
                )
                br, _ = Branch.objects.get_or_create(
                    code=self.branch.upper(),
                    defaults={'department': dept, 'name': dept_name}
                )
                try:
                    sem_int = int(self.semester)
                except (ValueError, TypeError):
                    sem_int = 1

                ac, _ = AcademicClass.objects.get_or_create(
                    branch=br,
                    year=self.year or 1,
                    semester=sem_int,
                    section=self.section or 'A',
                    defaults={'academic_year': f"{self.admission_year or 2024}-{ (self.admission_year or 2024) + 1 }"}
                )
                self.academic_class = ac
                needs_update = True
                update_fields.append('academic_class')
            except Exception:
                pass
        elif self.academic_class:
            if self.branch != self.academic_class.branch.code:
                self.branch = self.academic_class.branch.code
                needs_update = True
                update_fields.append('branch')
            if self.year != self.academic_class.year:
                self.year = self.academic_class.year
                needs_update = True
                update_fields.append('year')
            if self.semester != str(self.academic_class.semester):
                self.semester = str(self.academic_class.semester)
                needs_update = True
                update_fields.append('semester')
            if self.section != self.academic_class.section:
                self.section = self.academic_class.section
                needs_update = True
                update_fields.append('section')

        if needs_update:
            super().save(update_fields=update_fields)

        # Auto-provision or update student login account
        try:
            import os
            import logging
            from django.contrib.auth.models import User
            from accounts.models import UserProfile

            # Student ID is the primary login credential for students (both username & password from backend)
            student_ident = (self.student_id or self.roll_no or f"STU{self.id}").strip()
            user = None

            # 1. If this student already has a linked user profile, update that user
            if hasattr(self, 'user_profile') and self.user_profile and self.user_profile.user:
                user = self.user_profile.user
                if user.username.lower() != student_ident.lower():
                    existing = User.objects.filter(username__iexact=student_ident).exclude(pk=user.pk).first()
                    if not existing:
                        user.username = student_ident
            else:
                # 2. Check if user with username == student_ident already exists
                user = User.objects.filter(username__iexact=student_ident).first()
                if not user:
                    user = User.objects.create(
                        username=student_ident,
                        email=self.email or '',
                        first_name=self.name or ''
                    )

            if user:
                user.first_name = self.name or user.first_name
                if self.email:
                    user.email = self.email
                user.is_active = self.is_active
                # Ensure the student password in backend is their studentid
                user.set_password(student_ident)
                user.save()

                UserProfile.objects.update_or_create(
                    user=user,
                    defaults={
                        "role": "student",
                        "student": self,
                        "phone": (self.phone or '')[:30],
                        "department": self.department or ''
                    }
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Could not provision user account for student '{self.roll_no}': {e}")

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