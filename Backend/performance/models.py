from django.db import models
from students.models import Student


def calculate_grade_and_points(score):
    """
    Standard academic 10-point scale:
    90-100: A+ (10)
    80-89:  A  (9)
    70-79:  B+ (8)
    60-69:  B  (7)
    50-59:  C  (6)
    40-49:  P  (5) [Pass]
    <40:    F  (0) [Fail]
    """
    if score >= 90:
        return 'A+', 10.0, 'grade-aplus'
    elif score >= 80:
        return 'A', 9.0, 'grade-a'
    elif score >= 70:
        return 'B+', 8.0, 'grade-bplus'
    elif score >= 60:
        return 'B', 7.0, 'grade-b'
    elif score >= 50:
        return 'C', 6.0, 'grade-c'
    elif score >= 40:
        return 'P', 5.0, 'grade-pass'
    else:
        return 'F', 0.0, 'grade-fail'


class Subject(models.Model):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=150)
    department = models.CharField(max_length=100, default='Computer Science & Engineering', blank=True)
    branch = models.CharField(max_length=50, default='CSE')
    semester = models.CharField(max_length=10, default='1')
    credits = models.IntegerField(default=3)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['code']

    @property
    def subject_code(self):
        return self.code

    @property
    def subject_name(self):
        return self.name

    def __str__(self):
        return f"{self.code} - {self.name} ({self.branch})"


class Assessment(models.Model):
    ASSESSMENT_TYPES = (
        ('Internal 1', 'Internal Assessment 1'),
        ('Internal 2', 'Internal Assessment 2'),
        ('Assignment', 'Course Assignment'),
        ('Mid Examination', 'Mid-Term Examination'),
        ('End Semester', 'End Semester Examination'),
    )

    name = models.CharField(max_length=100, choices=ASSESSMENT_TYPES, default='Internal 1')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, null=True, blank=True, related_name='assessments')
    max_marks = models.FloatField(default=100.0)
    weightage_percent = models.FloatField(default=100.0)
    semester = models.CharField(max_length=10, blank=True, default='1')

    class Meta:
        ordering = ['subject', 'name']

    def __str__(self):
        sub_str = self.subject.code if self.subject else "General"
        return f"{self.name} - {sub_str} (Max: {self.max_marks})"


class Marks(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='marks')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='marks')
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name='student_marks')
    marks_obtained = models.FloatField()
    grade = models.CharField(max_length=10, blank=True, default='')
    grade_point = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('student', 'subject', 'assessment')
        ordering = ['student', 'subject', 'assessment']

    def save(self, *args, **kwargs):
        # Calculate grade point based on percentage of max_marks
        max_m = self.assessment.max_marks if self.assessment and self.assessment.max_marks > 0 else 100.0
        pct = (self.marks_obtained / max_m) * 100.0
        self.grade, self.grade_point, _ = calculate_grade_and_points(pct)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.student.name} - {self.subject.code} [{self.assessment.name}]: {self.marks_obtained}"


class StudentScore(models.Model):
    """
    Consolidated subject-level academic scores and grades.
    """
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='scores')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='scores')
    internals = models.FloatField(default=0.0)
    end_sem = models.FloatField(default=0.0)
    total = models.FloatField(default=0.0)
    grade = models.CharField(max_length=10, default='F')
    grade_point = models.FloatField(default=0.0)
    grade_class = models.CharField(max_length=20, default='grade-fail')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('student', 'subject')
        ordering = ['student', 'subject']

    def calculate_grade(self):
        self.total = round(self.internals + self.end_sem, 1)
        self.grade, self.grade_point, self.grade_class = calculate_grade_and_points(self.total)

    def save(self, *args, **kwargs):
        self.calculate_grade()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.student.name} - {self.subject.code}: {self.total} ({self.grade})"
