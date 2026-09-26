import uuid
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
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


# =====================================================================
# EXAM SESSIONS, TIMETABLE & AUTOMATED HALL TICKETS
# =====================================================================

class ExamSession(models.Model):
    EXAM_TYPE_CHOICES = (
        ('REGULAR', 'Semester End Regular Examination'),
        ('SUPPLEMENTARY', 'Supplementary / Backlog Examination'),
        ('MID_TERM', 'Mid-Term Examination'),
        ('INTERNAL', 'Internal Assessment Exam'),
    )

    name = models.CharField(max_length=200)
    college_name = models.CharField(max_length=250, default="ST. PETER'S ENGINEERING COLLEGE")
    academic_year = models.CharField(max_length=50, default="2025-2026")
    exam_type = models.CharField(max_length=50, choices=EXAM_TYPE_CHOICES, default='REGULAR')
    branch = models.CharField(max_length=50, default='ALL')
    semester = models.CharField(max_length=10, default='ALL')
    start_date = models.DateField()
    end_date = models.DateField()
    min_attendance_percentage = models.FloatField(default=75.0)
    is_published = models.BooleanField(default=True)
    is_approved_by_admin = models.BooleanField(default=False)
    approved_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_exam_sessions')
    approved_at = models.DateTimeField(null=True, blank=True)
    is_released_to_students = models.BooleanField(default=False)
    released_at = models.DateTimeField(null=True, blank=True)
    instructions = models.TextField(
        default="1. Candidates must arrive at the examination hall at least 15 minutes before commencement.\n"
                "2. Possession of mobile phones, smartwatches, or unauthorized study material is strictly prohibited.\n"
                "3. Candidates must carry their valid College Identity Card and this printed Hall Ticket.\n"
                "4. No candidate will be admitted to the examination hall 30 minutes after the exam start time.\n"
                "5. Write your Roll Number and Paper Code clearly on the answer booklet."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        return f"{self.name} ({self.academic_year})"


class ExamTimetable(models.Model):
    exam_session = models.ForeignKey(ExamSession, on_delete=models.CASCADE, related_name='timetable')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='exam_schedules')
    exam_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    hall_number = models.CharField(max_length=100, default='Main Examination Block')
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['exam_date', 'start_time']
        unique_together = ('exam_session', 'subject')

    def __str__(self):
        return f"{self.exam_session.name}: {self.subject.code} on {self.exam_date} {self.start_time}"


class HallTicket(models.Model):
    exam_session = models.ForeignKey(ExamSession, on_delete=models.CASCADE, related_name='hall_tickets')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='hall_tickets')
    hall_ticket_number = models.CharField(max_length=64, unique=True, blank=True)
    verification_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    calculated_attendance_pct = models.FloatField(default=0.0)
    is_eligible = models.BooleanField(default=True)
    is_condoned = models.BooleanField(default=False)
    condonation_reason = models.TextField(blank=True, default='')
    condoned_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='condoned_hall_tickets')
    condoned_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('exam_session', 'student')
        ordering = ['exam_session', 'student__roll_no']

    def save(self, *args, **kwargs):
        if not self.hall_ticket_number:
            year_part = self.exam_session.academic_year.replace('-', '')[-4:]
            branch_part = (self.student.branch or 'ENG')[:3].upper()
            sess_id = self.exam_session_id or (self.exam_session.id if self.exam_session else 1)
            stu_id = self.student_id or (self.student.id if self.student else 1)
            self.hall_ticket_number = f"HT-{year_part}-{sess_id:02d}-{branch_part}-{stu_id:04d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.hall_ticket_number} - {self.student.name} ({self.exam_session.name})"

