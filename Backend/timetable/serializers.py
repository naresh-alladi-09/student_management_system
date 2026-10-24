from rest_framework import serializers
from .models import TimetableSlot, check_timetable_conflicts
from performance.serializers import SubjectSerializer


class TimetableSlotSerializer(serializers.ModelSerializer):
    subject_details = SubjectSerializer(source='subject', read_only=True)
    teacher_name = serializers.SerializerMethodField()
    academic_class_name = serializers.SerializerMethodField()

    class Meta:
        model = TimetableSlot
        fields = [
            'id',
            'subject',
            'subject_details',
            'teacher',
            'teacher_name',
            'day',
            'start_time',
            'end_time',
            'room',
            'branch',
            'year',
            'semester',
            'section',
            'academic_class',
            'academic_class_name',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_teacher_name(self, obj):
        if not obj.teacher:
            return "Unassigned"
        full = obj.teacher.get_full_name()
        return full if full.strip() else obj.teacher.username

    def get_academic_class_name(self, obj):
        return str(obj.academic_class) if obj.academic_class else f"{obj.branch} Y{obj.year}S{obj.semester}-{obj.section}"

    def validate(self, attrs):
        instance = self.instance
        day = attrs.get('day', instance.day if instance else None)
        start_time = attrs.get('start_time', instance.start_time if instance else None)
        end_time = attrs.get('end_time', instance.end_time if instance else None)
        teacher = attrs.get('teacher', instance.teacher if instance else None)
        branch = attrs.get('branch', instance.branch if instance else 'CSE')
        year = attrs.get('year', instance.year if instance else 1)
        semester = attrs.get('semester', instance.semester if instance else '1')
        section = attrs.get('section', instance.section if instance else 'A')
        academic_class = attrs.get('academic_class', instance.academic_class if instance else None)
        room = attrs.get('room', instance.room if instance else '')

        conflict = check_timetable_conflicts(
            day=day,
            start_time=start_time,
            end_time=end_time,
            teacher=teacher,
            branch=branch,
            year=year,
            semester=semester,
            section=section,
            academic_class=academic_class,
            room=room,
            exclude_slot_id=instance.pk if instance else None
        )

        if conflict['has_conflict']:
            field_name = conflict.get('field') or 'non_field_errors'
            raise serializers.ValidationError({
                'detail': conflict['message'],
                field_name: conflict['message'],
                'conflict_type': conflict.get('conflict_type')
            })

        return attrs
