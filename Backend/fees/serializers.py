from rest_framework import serializers
from .models import FeeCategory, FeeStructure, StudentFeeRecord, FeePayment, FeePaymentSetting
from students.serializers import StudentSerializer


class FeeCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = FeeCategory
        fields = '__all__'


class FeeStructureSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='fee_category.name', read_only=True)
    category_code = serializers.CharField(source='fee_category.code', read_only=True)

    class Meta:
        model = FeeStructure
        fields = '__all__'


class FeePaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    student_roll_no = serializers.CharField(source='student.roll_no', read_only=True)
    category_name = serializers.CharField(source='fee_record.fee_category.name', read_only=True)
    collected_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FeePayment
        fields = '__all__'

    def get_collected_by_name(self, obj):
        if obj.collected_by:
            return obj.collected_by.get_full_name() or obj.collected_by.username
        return 'System Automated'


class StudentFeeRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    student_roll_no = serializers.CharField(source='student.roll_no', read_only=True)
    student_branch = serializers.CharField(source='student.branch', read_only=True)
    student_year = serializers.IntegerField(source='student.year', read_only=True)
    student_semester = serializers.CharField(source='student.semester', read_only=True)
    student_section = serializers.CharField(source='student.section', read_only=True)
    student_email = serializers.CharField(source='student.email', read_only=True)
    student_phone = serializers.CharField(source='student.phone', read_only=True)
    category_name = serializers.CharField(source='fee_category.name', read_only=True)
    category_code = serializers.CharField(source='fee_category.code', read_only=True)
    is_mandatory_for_exam = serializers.BooleanField(source='fee_category.is_mandatory_for_exam', read_only=True)
    net_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    balance_due = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    payments = FeePaymentSerializer(many=True, read_only=True)

    class Meta:
        model = StudentFeeRecord
        fields = [
            'id',
            'student',
            'student_name',
            'student_roll_no',
            'student_branch',
            'student_year',
            'student_semester',
            'student_section',
            'student_email',
            'student_phone',
            'fee_category',
            'category_name',
            'category_code',
            'is_mandatory_for_exam',
            'academic_year',
            'year',
            'semester',
            'total_amount',
            'discount_amount',
            'net_amount',
            'paid_amount',
            'balance_due',
            'due_date',
            'status',
            'is_cleared_for_exam',
            'cleared_by',
            'cleared_at',
            'clearance_remarks',
            'payments',
            'created_at',
            'updated_at',
        ]


class FeePaymentSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeePaymentSetting
        fields = '__all__'

