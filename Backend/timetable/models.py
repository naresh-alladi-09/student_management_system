from django.db import models
from django.contrib.auth.models import User
from performance.models import Subject


class TimetableSlot(models.Model):
    DAY_CHOICES = (
        ('Monday', 'Monday'),
        ('Tuesday', 'Tuesday'),
        ('Wednesday', 'Wednesday'),
        ('Thursday', 'Thursday'),
        ('Friday', 'Friday'),
        ('Saturday', 'Saturday'),
    )

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='timetable_slots')
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='teaching_slots')
    day = models.CharField(max_length=15, choices=DAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()
    room = models.CharField(max_length=50, default='Room 101')
    branch = models.CharField(max_length=50, default='CSE')
    year = models.IntegerField(default=1)
    semester = models.CharField(max_length=10, default='1')
    section = models.CharField(max_length=10, default='A')
    academic_class = models.ForeignKey(
        'students.AcademicClass',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='timetable_slots'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['day', 'start_time']

    def save(self, *args, **kwargs):
        if not self.academic_class:
            try:
                from students.models import AcademicClass
                sem_int = int(self.semester) if str(self.semester).isdigit() else 1
                ac = AcademicClass.objects.filter(
                    branch__code__iexact=self.branch,
                    semester=sem_int,
                    section__iexact=self.section
                ).first()
                if ac:
                    self.academic_class = ac
                    if ac.year:
                        self.year = ac.year
            except Exception:
                pass
        elif self.academic_class:
            if self.academic_class.branch:
                self.branch = self.academic_class.branch.code
            if self.academic_class.year:
                self.year = self.academic_class.year
            if self.academic_class.semester:
                self.semester = str(self.academic_class.semester)
            if self.academic_class.section:
                self.section = self.academic_class.section
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.day} {self.start_time}-{self.end_time}: {self.subject.code} ({self.room})"

