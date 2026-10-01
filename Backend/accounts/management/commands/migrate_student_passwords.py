from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from accounts.models import UserProfile
from students.models import Student
from audit.models import AuditLog


class Command(BaseCommand):
    help = "Secures existing student accounts by invalidating predictable default passwords and generating activation tokens."

    def add_arguments(self, parser):
        parser.add_argument(
            '--force-all',
            action='store_true',
            help='Force activation token generation for ALL student accounts regardless of current status.',
        )

    def handle(self, *args, **options):
        force_all = options['force_all']
        students = Student.objects.all().select_related('academic_class')
        secured_count = 0
        already_active = 0

        self.stdout.write(f"Auditing {students.count()} student accounts for insecure default passwords...")

        for s in students:
            ident = (s.student_id or s.roll_no or f"STU{s.id}").strip()
            profile = getattr(s, 'user_profile', None)

            if not profile or not profile.user:
                user, _ = User.objects.get_or_create(
                    username=ident,
                    defaults={'email': s.email or '', 'first_name': s.name or ''}
                )
                user.set_unusable_password()
                user.save()
                profile, _ = UserProfile.objects.update_or_create(
                    user=user,
                    defaults={'role': 'student', 'student': s, 'is_activated': False}
                )
                token = profile.generate_activation_token(hours=168)
                secured_count += 1
                self.stdout.write(f"  [PROVISIONED] Student {ident}: Token generated.")
                continue

            user = profile.user
            is_predictable = False

            # Check if student password matches known predictable formats
            for candidate in [s.student_id, s.roll_no, ident, ident.lower(), ident.upper()]:
                if candidate and user.check_password(candidate):
                    is_predictable = True
                    break

            if force_all or is_predictable or not profile.is_activated:
                user.set_unusable_password()
                user.save()
                token = profile.generate_activation_token(hours=168)
                secured_count += 1
                self.stdout.write(f"  [SECURED] Student {ident}: predictable password removed, activation token generated.")
            else:
                already_active += 1

        AuditLog.log(
            action='STUDENT_UPDATE',
            entity='System',
            entity_id='0',
            description=f"Ran student password migration: {secured_count} secured/unactivated, {already_active} preserved."
        )

        self.stdout.write(self.style.SUCCESS(
            f"Migration complete: {secured_count} student accounts secured with activation tokens, {already_active} active accounts preserved."
        ))
