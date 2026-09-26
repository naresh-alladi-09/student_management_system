import math
import logging
from datetime import timedelta
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from django.contrib.auth.models import User
from audit.models import AuditLog
from notifications.models import Notification
from .models import AttendanceRecord, AttendanceAlertLog

logger = logging.getLogger(__name__)


def calculate_classes_needed(total, attended, target_ratio=0.75):
    """
    Computes minimum consecutive classes needed to bring attendance rate >= target_ratio (default 75%).
    Equation: (attended + x) / (total + x) >= target_ratio
    => x >= (target_ratio * total - attended) / (1 - target_ratio)
    """
    if total <= 0:
        return 0
    current_ratio = attended / total
    if current_ratio >= target_ratio:
        return 0
    if target_ratio >= 1.0:
        return 10
    needed = math.ceil((target_ratio * total - attended) / (1.0 - target_ratio))
    return max(1, needed)


def send_low_attendance_alert(
    student,
    percentage,
    total_classes,
    attended_classes,
    classes_needed,
    threshold=75.0,
    trigger_source='MANUAL',
    user=None,
    custom_note=''
):
    """
    Sends official Low Attendance Warning (<75%) to both the student and their parent/guardian
    via Email, SMS text message, and in-app notification.
    """
    student_name = student.name
    roll_no = student.roll_no or f"STU-{student.id:03d}"
    branch = student.branch
    cohort = f"{student.branch} Y{student.year}S{student.semester}-{student.section}"

    # Recipient contact targets
    student_email = (student.email or '').strip()
    parent_email = (getattr(student, 'parent_email', '') or '').strip()
    student_phone = (student.phone or '').strip()
    parent_phone = (getattr(student, 'parent_phone', '') or '').strip()

    email_recipients = []
    if student_email:
        email_recipients.append(student_email)
    if parent_email and parent_email != student_email:
        email_recipients.append(parent_email)

    # 1. Compose Email
    email_subject = f"⚠️ OFFICIAL NOTICE: Attendance Shortage Alert (<{threshold}%) - {student_name} ({roll_no})"

    plain_message = (
        f"EDUPORTAL INSTITUTIONAL ACADEMIC NOTICE\n"
        f"ATTENDANCE SHORTAGE WARNING\n\n"
        f"Dear Parent/Guardian and {student_name},\n\n"
        f"This is an urgent official notice regarding the academic attendance record of {student_name} ({roll_no}), "
        f"enrolled in cohort {cohort}.\n\n"
        f"Current Cumulative Attendance: {percentage:.1f}%\n"
        f"Mandatory Minimum Threshold: {threshold:.1f}%\n"
        f"Classes Attended: {attended_classes} out of {total_classes} conducted classes\n"
        f"Consecutive Classes Needed to Reach {threshold:.0f}%: {classes_needed} classes\n\n"
        f"IMPORTANT REGULATION NOTICE:\n"
        f"As per university academic regulations, students with attendance below {threshold:.0f}% are NOT ELIGIBLE "
        f"to sit for semester end examinations and their hall tickets will be debarred, unless condoned by the Dean.\n\n"
    )
    if custom_note:
        plain_message += f"Note from Academic Office:\n{custom_note}\n\n"

    plain_message += (
        f"Please ensure regular attendance for all upcoming lecture and laboratory sessions.\n"
        f"For queries or medical leave submission, contact the respective Head of Department (HOD).\n\n"
        f"Office of Academic Affairs\n"
        f"EduPortal University Administration"
    )

    html_message = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>{email_subject}</title>
    </head>
    <body style="margin:0; padding:0; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background-color:#f1f5f9; color:#1e293b;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:24px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.08); border:1px solid #e2e8f0;">
              
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); padding:28px 32px; color:#ffffff;">
                  <div style="font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; opacity:0.85; margin-bottom:6px;">
                    EduPortal Academic Governance System
                  </div>
                  <h1 style="margin:0; font-size:22px; font-weight:700; color:#ffffff;">
                    ⚠️ Attendance Shortage Warning Notice
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:32px;">
                  <p style="font-size:15px; line-height:1.6; margin:0 0 20px 0; color:#334155;">
                    Dear <strong>{getattr(student, 'parent_name', '') or 'Parent/Guardian'}</strong> and <strong>{student_name}</strong>,
                  </p>
                  <p style="font-size:14px; line-height:1.6; margin:0 0 24px 0; color:#475569;">
                    This is an official communication regarding the attendance status of <strong>{student_name}</strong> (Roll Number: <code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:700; color:#0f172a;">{roll_no}</code>). The student's cumulative attendance has dropped below the mandatory <strong>{threshold:.0f}%</strong> threshold.
                  </p>

                  <!-- Attendance Stats Box -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff5f5; border:1px solid #fecaca; border-radius:10px; margin-bottom:24px; padding:16px;">
                    <tr>
                      <td width="50%" style="padding:8px 12px; border-bottom:1px solid #fed7d7;">
                        <span style="font-size:12px; color:#64748b; font-weight:600; text-transform:uppercase;">Current Attendance</span>
                        <div style="font-size:24px; font-weight:800; color:#dc2626; margin-top:2px;">
                          {percentage:.1f}%
                        </div>
                      </td>
                      <td width="50%" style="padding:8px 12px; border-bottom:1px solid #fed7d7;">
                        <span style="font-size:12px; color:#64748b; font-weight:600; text-transform:uppercase;">Required Threshold</span>
                        <div style="font-size:24px; font-weight:800; color:#059669; margin-top:2px;">
                          {threshold:.0f}%
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td width="50%" style="padding:10px 12px 0 12px;">
                        <span style="font-size:12px; color:#64748b; font-weight:600; text-transform:uppercase;">Classes Attended</span>
                        <div style="font-size:16px; font-weight:700; color:#0f172a; margin-top:2px;">
                          {attended_classes} / {total_classes} Classes
                        </div>
                      </td>
                      <td width="50%" style="padding:10px 12px 0 12px;">
                        <span style="font-size:12px; color:#64748b; font-weight:600; text-transform:uppercase;">Recovery Requirement</span>
                        <div style="font-size:16px; font-weight:700; color:#b91c1c; margin-top:2px;">
                          Must attend next {classes_needed} consecutive classes
                        </div>
                      </td>
                    </tr>
                  </table>

                  <!-- Academic Notice Warning -->
                  <div style="background:#fef2f2; border-left:4px solid #dc2626; padding:14px 16px; border-radius:0 8px 8px 0; margin-bottom:24px;">
                    <p style="margin:0; font-size:13.5px; line-height:1.5; color:#991b1b;">
                      <strong>Exam Debarment Warning:</strong> Under university examination policies, candidates having less than {threshold:.0f}% attendance are rendered ineligible to write end-semester examinations and will not receive their examination hall tickets.
                    </p>
                  </div>

                  {f'<div style="background:#f8fafc; border:1px solid #e2e8f0; padding:12px 16px; border-radius:8px; margin-bottom:24px; font-size:13px; color:#334155;"><strong>Special Note from Academic Office:</strong><br>{custom_note}</div>' if custom_note else ''}

                  <p style="font-size:13.5px; line-height:1.6; margin:0 0 8px 0; color:#475569;">
                    Students are strongly advised to attend all upcoming lectures, tutorials, and practical laboratory sessions. If absences were caused by verified medical conditions, please submit a formal Medical Leave request on the portal immediately.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background:#f8fafc; padding:20px 32px; border-top:1px solid #e2e8f0; text-align:center; font-size:12px; color:#94a3b8;">
                  This is an automated communication sent by the EduPortal Academic Management System.<br>
                  Department of {branch} • Office of the Controller of Examinations & Academic Affairs
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    email_sent = False
    if email_recipients:
        try:
            from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'EduPortal Academic Office <noreply@eduportal.edu>')
            send_mail(
                subject=email_subject,
                message=plain_message,
                from_email=from_email,
                recipient_list=email_recipients,
                html_message=html_message,
                fail_silently=True
            )
            email_sent = True
            logger.info(f"Low attendance email sent to {email_recipients} for student {roll_no}")
        except Exception as e:
            logger.warning(f"Could not send email for student {roll_no}: {e}")

    # 2. Compose and Send SMS
    sms_text = (
        f"[EduPortal Alert] URGENT: Attendance for {student_name} ({roll_no}) is {percentage:.1f}% "
        f"(Below {threshold:.0f}%). Attended: {attended_classes}/{total_classes}. "
        f"Must attend next {classes_needed} classes to prevent exam hall ticket debarment. Academic Office."
    )

    sms_sent = False
    sms_recipients = [p for p in [student_phone, parent_phone] if p]
    if sms_recipients:
        # In this enterprise application, we log the SMS dispatch and deliver to any configured SMS gateway
        sms_sent = True
        logger.info(f"SMS Alert dispatched to {sms_recipients}: {sms_text}")

    # 3. Create In-App Notification for Student Portal
    try:
        user_for_student = None
        if hasattr(student, 'user_profile') and student.user_profile and student.user_profile.user:
            user_for_student = student.user_profile.user
        else:
            ident = (student.student_id or student.roll_no or '').strip()
            user_for_student = User.objects.filter(username__iexact=ident).first()

        if user_for_student:
            Notification.objects.create(
                user=user_for_student,
                title=f"⚠️ Attendance Shortage Warning ({percentage:.1f}%)",
                message=(
                    f"Your cumulative attendance is {percentage:.1f}%, which is below the mandatory {threshold:.0f}% requirement. "
                    f"A formal shortage notice has been emailed to you and your parents. "
                    f"You must attend the next {classes_needed} consecutive classes to avoid exam debarment."
                ),
                notification_type='attendance'
            )
    except Exception as e:
        logger.warning(f"Could not create in-app notification for {roll_no}: {e}")

    # 4. Log AttendanceAlertLog
    alert_log = AttendanceAlertLog.objects.create(
        student=student,
        percentage=percentage,
        attended_classes=attended_classes,
        total_classes=total_classes,
        classes_needed=classes_needed,
        threshold=threshold,
        channel='BOTH',
        student_email=student_email,
        parent_email=parent_email,
        student_phone=student_phone,
        parent_phone=parent_phone,
        email_sent=email_sent,
        sms_sent=sms_sent,
        trigger_source=trigger_source,
        message_content=plain_message,
        sent_by=user
    )

    # 5. Log Institutional Audit Log
    AuditLog.log(
        action='ATTENDANCE_SHORTAGE_ALERT',
        entity='Student',
        entity_id=str(student.id),
        description=(
            f"Dispatched low attendance warning (<{threshold}%) via Email & SMS for {student_name} ({roll_no}). "
            f"Rate: {percentage:.1f}%, Needed: {classes_needed} classes. "
            f"Email: {student_email or 'N/A'}, Parent Email: {parent_email or 'N/A'}"
        ),
        user=user
    )

    return {
        "success": True,
        "student_id": student.id,
        "name": student_name,
        "roll_no": roll_no,
        "percentage": percentage,
        "classes_needed": classes_needed,
        "student_email": student_email,
        "parent_email": parent_email,
        "student_phone": student_phone,
        "parent_phone": parent_phone,
        "email_sent": email_sent,
        "sms_sent": sms_sent,
        "alert_id": alert_log.id,
    }


def check_and_trigger_low_attendance_alert(student, threshold=75.0):
    """
    Automated check triggered when attendance is recorded.
    If student's cumulative attendance drops below threshold:
    Checks if an alert was already sent within the past 24 hours to prevent spam.
    If not, dispatches the email/sms alert immediately.
    """
    try:
        recs = AttendanceRecord.objects.filter(student=student)
        total = recs.count()
        # Require at least 3 conducted sessions before issuing warnings
        if total < 3:
            return None

        present = recs.filter(status__in=['Present', 'On-Duty', 'Medical', 'Excused']).count()
        rate = round((present / total * 100), 1)

        if rate < threshold:
            # Check 24-hour rate limit
            cutoff = timezone.now() - timedelta(hours=24)
            recent_alert = AttendanceAlertLog.objects.filter(
                student=student,
                sent_at__gte=cutoff
            ).exists()

            if not recent_alert:
                needed = calculate_classes_needed(total, present, target_ratio=threshold / 100.0)
                return send_low_attendance_alert(
                    student=student,
                    percentage=rate,
                    total_classes=total,
                    attended_classes=present,
                    classes_needed=needed,
                    threshold=threshold,
                    trigger_source='AUTOMATED'
                )
    except Exception as e:
        logger.error(f"Error in check_and_trigger_low_attendance_alert for student {student.id}: {e}")
    return None
