import uuid
from decimal import Decimal
from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from students.models import Student


class FeeCategory(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)  # e.g., TUITION, EXAM, LAB, TRANSPORT, HOSTEL
    description = models.TextField(blank=True, default='')
    is_mandatory_for_exam = models.BooleanField(
        default=True,
        help_text="Whether clearance of this fee is required to unlock exam hall tickets"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Fee Categories'

    def __str__(self):
        return f"{self.name} ({self.code})"


class FeeStructure(models.Model):
    academic_year = models.CharField(max_length=50, default='2025-2026')
    branch = models.CharField(max_length=50, default='ALL')
    year = models.IntegerField(default=1)
    semester = models.IntegerField(default=1)
    fee_category = models.ForeignKey(FeeCategory, on_delete=models.CASCADE, related_name='structures')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['academic_year', 'year', 'semester', 'fee_category']

    def __str__(self):
        return f"{self.academic_year} Y{self.year}S{self.semester} {self.branch} - {self.fee_category.name}: ₹{self.amount}"


class StudentFeeRecord(models.Model):
    STATUS_CHOICES = (
        ('PAID', 'Fully Paid'),
        ('PARTIAL', 'Partially Paid'),
        ('PENDING', 'Payment Pending'),
        ('OVERDUE', 'Payment Overdue'),
    )

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='fee_records')
    fee_category = models.ForeignKey(FeeCategory, on_delete=models.PROTECT, related_name='student_fee_records')
    academic_year = models.CharField(max_length=50, default='2025-2026')
    year = models.IntegerField(default=1)
    semester = models.IntegerField(default=1)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    paid_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    is_cleared_for_exam = models.BooleanField(
        default=False,
        help_text="Examination clearance / No-Dues certificate status"
    )
    cleared_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='cleared_fee_records'
    )
    cleared_at = models.DateTimeField(null=True, blank=True)
    clearance_remarks = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-academic_year', 'student__roll_no', 'fee_category']
        unique_together = ('student', 'fee_category', 'academic_year', 'semester')

    @property
    def net_amount(self):
        return max(Decimal('0.00'), self.total_amount - self.discount_amount)

    @property
    def balance_due(self):
        return max(Decimal('0.00'), self.net_amount - self.paid_amount)

    def update_status(self):
        net = self.net_amount
        if self.paid_amount >= net and net > 0:
            self.status = 'PAID'
            self.is_cleared_for_exam = True
        elif self.paid_amount > 0:
            self.status = 'PARTIAL'
        elif self.due_date and self.due_date < timezone.now().date():
            self.status = 'OVERDUE'
        else:
            self.status = 'PENDING'

    def save(self, *args, **kwargs):
        self.update_status()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.student.name} ({self.student.roll_no}) - {self.fee_category.name}: ₹{self.paid_amount}/₹{self.net_amount} [{self.status}]"


class FeePayment(models.Model):
    PAYMENT_METHOD_CHOICES = (
        ('UPI', 'UPI / QR Payment'),
        ('NET_BANKING', 'Internet Banking / NEFT / RTGS'),
        ('CARD', 'Credit / Debit Card'),
        ('CASH', 'Cash Counter'),
        ('CHEQUE', 'Cheque / Demand Draft'),
    )

    receipt_number = models.CharField(max_length=64, unique=True, blank=True)
    fee_record = models.ForeignKey(StudentFeeRecord, on_delete=models.CASCADE, related_name='payments')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='fee_payments')
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(max_length=30, choices=PAYMENT_METHOD_CHOICES, default='UPI')
    transaction_reference = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="UPI UTR number, bank transaction ID, or cheque number"
    )
    payment_date = models.DateTimeField(default=timezone.now)
    collected_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='collected_fee_payments'
    )
    remarks = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-payment_date']

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        if not self.receipt_number:
            year_str = timezone.now().strftime('%Y')
            branch_str = (self.student.branch or 'GEN')[:3].upper()
            rand_token = uuid.uuid4().hex[:6].upper()
            self.receipt_number = f"REC-{year_str}-{branch_str}-{rand_token}"

        super().save(*args, **kwargs)

        if is_new:
            # Update parent StudentFeeRecord paid amount
            self.fee_record.paid_amount = (self.fee_record.paid_amount or Decimal('0.00')) + self.amount_paid
            self.fee_record.save()

    def __str__(self):
        return f"Receipt {self.receipt_number}: ₹{self.amount_paid} by {self.student.name}"
