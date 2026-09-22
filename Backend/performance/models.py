from django.db import models
from students.models import Student


class Subject(models.Model):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=150)
    branch = models.CharField(max_length=50, default='CSE')
    semester = models.CharField(max_length=10, default='1')
    credits = models.IntegerField(default=3)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f"{self.code} - {self.name} ({self.branch})"


class StudentScore(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='scores')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='scores')
    internals = models.FloatField(default=25.0)
    end_sem = models.FloatField(default=60.0)
    total = models.FloatField(default=85.0)
    grade = models.CharField(max_length=10, default='A')
    grade_class = models.CharField(max_length=20, default='grade-a')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('student', 'subject')
        ordering = ['student', 'subject']

    def calculate_grade(self):
        self.total = round(self.internals + self.end_sem, 1)
        if self.total >= 90:
            self.grade = 'A+'
            self.grade_class = 'grade-aplus'
        elif self.total >= 80:
            self.grade = 'A'
            self.grade_class = 'grade-a'
        elif self.total >= 70:
            self.grade = 'B'
            self.grade_class = 'grade-b'
        elif self.total >= 60:
            self.grade = 'C'
            self.grade_class = 'grade-c'
        else:
            self.grade = 'D'
            self.grade_class = 'grade-d'

    def save(self, *args, **kwargs):
        self.calculate_grade()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.student.name} - {self.subject.code}: {self.total} ({self.grade})"
