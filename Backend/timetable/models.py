from datetime import datetime, time
from django.db import models
from django.db.models import Q
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from performance.models import Subject


def parse_time_value(val):
    if val is None:
        return None
    if isinstance(val, time):
        return val
    if isinstance(val, str):
        val = val.strip()
        for fmt in ('%H:%M:%S', '%H:%M'):
            try:
                return datetime.strptime(val[:8], fmt).time()
            except ValueError:
                pass
    raise ValueError(f"Invalid time format: {val}")


def check_timetable_conflicts(
    day,
    start_time,
    end_time,
    teacher,
    branch='CSE',
    year=1,
    semester='1',
    section='A',
    academic_class=None,
    room=None,
    exclude_slot_id=None
):
    """
    Validates timetable slot concurrency rules:
    1. start_time must be strictly before end_time.
    2. Faculty Concurrency: Same faculty cannot teach multiple classes at the same time.
    3. Class/Student Concurrency: Students of a class cannot attend multiple lectures at the same time.
    4. Room Concurrency: Physical classroom/lab cannot be occupied by multiple classes at the same time.
    """
    try:
        parsed_start = parse_time_value(start_time)
        parsed_end = parse_time_value(end_time)
    except Exception as e:
        return {
            'has_conflict': True,
            'conflict_type': 'invalid_time',
            'field': 'start_time',
            'message': str(e),
            'conflicting_slot': None
        }

    if parsed_start and parsed_end and parsed_start >= parsed_end:
        return {
            'has_conflict': True,
            'conflict_type': 'invalid_time',
            'field': 'start_time',
            'message': f"Start time ({parsed_start.strftime('%I:%M %p')}) must be strictly before end time ({parsed_end.strftime('%I:%M %p')}).",
            'conflicting_slot': None
        }

    if not day:
        return {
            'has_conflict': True,
            'conflict_type': 'missing_day',
            'field': 'day',
            'message': "Day of the week is required.",
            'conflicting_slot': None
        }

    # Resolve academic class if not provided
    resolved_academic_class = academic_class
    if not resolved_academic_class and branch and semester and section:
        try:
            from students.models import AcademicClass
            sem_int = int(semester) if str(semester).isdigit() else 1
            resolved_academic_class = AcademicClass.objects.filter(
                branch__code__iexact=branch,
                semester=sem_int,
                section__iexact=section
            ).first()
        except Exception:
            pass

    # Find overlapping slots on the same day:
    # Slot overlaps if: slot.start_time < new.end_time AND slot.end_time > new.start_time
    overlapping_qs = TimetableSlot.objects.filter(
        day__iexact=day,
        start_time__lt=parsed_end,
        end_time__gt=parsed_start
    ).select_related('subject', 'teacher', 'academic_class')

    if exclude_slot_id:
        overlapping_qs = overlapping_qs.exclude(pk=exclude_slot_id)

    # 1. Faculty / Teacher Concurrency Conflict
    # Same faculty cannot teach multiple classes at the same time
    teacher_id = teacher.id if hasattr(teacher, 'id') else teacher
    if teacher_id:
        teacher_conflict = overlapping_qs.filter(teacher_id=teacher_id).first()
        if teacher_conflict:
            t_name = teacher_conflict.teacher.get_full_name() or teacher_conflict.teacher.username
            c_name = str(teacher_conflict.academic_class) if teacher_conflict.academic_class else f"{teacher_conflict.branch} Y{teacher_conflict.year}S{teacher_conflict.semester}-{teacher_conflict.section}"
            sub_label = f"{teacher_conflict.subject.code} ({teacher_conflict.subject.name})"
            st_str = teacher_conflict.start_time.strftime('%I:%M %p')
            et_str = teacher_conflict.end_time.strftime('%I:%M %p')
            return {
                'has_conflict': True,
                'conflict_type': 'faculty_conflict',
                'field': 'teacher',
                'message': (
                    f"Faculty Concurrency Conflict: {t_name} is already assigned to teach {sub_label} "
                    f"for {c_name} on {day} from {st_str} to {et_str}. "
                    f"The same faculty member cannot teach multiple classes at the same time."
                ),
                'conflicting_slot': teacher_conflict
            }

    # 2. Class / Student Concurrency Conflict
    # Students cannot be present in different classes at the same time
    class_q = Q()
    if resolved_academic_class:
        class_q |= Q(academic_class=resolved_academic_class)

    b_str = branch.strip() if branch else ''
    sem_str = str(semester).strip() if semester is not None else ''
    sec_str = section.strip() if section else 'A'

    cohort_q = Q(branch__iexact=b_str, semester=sem_str)
    if year:
        cohort_q &= Q(year=year)

    if sec_str.upper() not in ['ALL', '']:
        cohort_q &= Q(section__in=[sec_str, sec_str.upper(), sec_str.lower(), 'All', 'ALL', 'all', ''])

    class_q |= cohort_q

    class_conflict = overlapping_qs.filter(class_q).first()
    if class_conflict:
        c_name = str(class_conflict.academic_class) if class_conflict.academic_class else f"{class_conflict.branch} Y{class_conflict.year}S{class_conflict.semester}-{class_conflict.section}"
        t_name = class_conflict.teacher.get_full_name() or class_conflict.teacher.username
        sub_label = f"{class_conflict.subject.code} ({class_conflict.subject.name})"
        st_str = class_conflict.start_time.strftime('%I:%M %p')
        et_str = class_conflict.end_time.strftime('%I:%M %p')
        return {
            'has_conflict': True,
            'conflict_type': 'class_conflict',
            'field': 'academic_class',
            'message': (
                f"Class Concurrency Conflict: Class {c_name} already has a slot scheduled "
                f"({sub_label} taught by {t_name}) on {day} from {st_str} to {et_str}. "
                f"Students cannot attend multiple classes at the same time."
            ),
            'conflicting_slot': class_conflict
        }

    # 3. Room Concurrency Conflict
    # Same physical room cannot host multiple classes simultaneously
    if room and room.strip() and room.strip().lower() not in ['online', 'virtual', 'n/a', 'none', '-']:
        room_conflict = overlapping_qs.filter(room__iexact=room.strip()).first()
        if room_conflict:
            c_name = str(room_conflict.academic_class) if room_conflict.academic_class else f"{room_conflict.branch} Y{room_conflict.year}S{room_conflict.semester}-{room_conflict.section}"
            sub_label = f"{room_conflict.subject.code} ({room_conflict.subject.name})"
            st_str = room_conflict.start_time.strftime('%I:%M %p')
            et_str = room_conflict.end_time.strftime('%I:%M %p')
            return {
                'has_conflict': True,
                'conflict_type': 'room_conflict',
                'field': 'room',
                'message': (
                    f"Room Concurrency Conflict: Room '{room.strip()}' is already booked for {c_name} "
                    f"({sub_label}) on {day} from {st_str} to {et_str}."
                ),
                'conflicting_slot': room_conflict
            }

    return {
        'has_conflict': False,
        'conflict_type': None,
        'field': None,
        'message': None,
        'conflicting_slot': None
    }


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

    def clean(self):
        super().clean()
        conflict = check_timetable_conflicts(
            day=self.day,
            start_time=self.start_time,
            end_time=self.end_time,
            teacher=self.teacher,
            branch=self.branch,
            year=self.year,
            semester=self.semester,
            section=self.section,
            academic_class=self.academic_class,
            room=self.room,
            exclude_slot_id=self.pk
        )
        if conflict['has_conflict']:
            field_name = conflict.get('field') or '__all__'
            raise ValidationError({field_name: conflict['message']})

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
