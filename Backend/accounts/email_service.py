"""
Smart Hybrid Email Dispatch Service for Student Management System.

Architecture:
1. Resend REST API (HTTPS Port 443):
   Used when RESEND_API_KEY is configured. Ideal for Render / cloud platforms
   where outbound SMTP (ports 587, 465, 25) is blocked on Free tiers.
2. Standard Django SMTP (Gmail, Outlook, etc.):
   Used as primary when on localhost or when no API key is provided.
3. Resilient Error Handling:
   Translates cryptic network errors (like [Errno 101] Network is unreachable)
   into helpful, actionable instructions.
"""
import os
import json
import logging
import urllib.request
import urllib.error
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def send_smart_email(subject, plain_msg, recipient_list, html_msg=None, from_email=None):
    """
    Intelligently dispatches email via Resend API (HTTPS Port 443) if RESEND_API_KEY is set,
    otherwise falls back to Django's configured SMTP backend.

    Returns:
        (success: bool, info: dict)
    """
    if isinstance(recipient_list, str):
        recipient_list = [recipient_list]
    recipient_list = [r.strip() for r in recipient_list if r and r.strip()]

    if not recipient_list:
        return False, {
            "message": "No valid recipient email address provided.",
            "error": "No recipient email."
        }

    # -------------------------------------------------------------------------
    # 1. LIVE CLOUD / RENDER: BREVO REST API (HTTPS Port 443 - No custom domain needed)
    # -------------------------------------------------------------------------
    brevo_api_key = os.environ.get('BREVO_API_KEY', '').strip().strip('\'"').replace(' ', '')
    if brevo_api_key:
        # Detect if user accidentally copied an SMTP key instead of an API key
        if brevo_api_key.startswith('xsmtpsib-'):
            err_msg = (
                "You pasted a Brevo SMTP key (starts with 'xsmtpsib-'). "
                "The REST API requires an API Key (starts with 'xkeysib-'). "
                "In Brevo, go to SMTP & API -> click the 'API Keys' tab (not SMTP tab) -> Generate a new API key."
            )
            return False, {
                "provider": "brevo_https",
                "message": err_msg,
                "error": err_msg
            }

        try:
            sender_email = (
                os.environ.get('BREVO_SENDER_EMAIL', '').strip().strip('\'"')
                or getattr(settings, 'EMAIL_HOST_USER', '')
                or 'nareshalladi09@gmail.com'
            )
            payload = {
                "sender": {"name": "Smart Campus Academic Affairs", "email": sender_email},
                "to": [{"email": r} for r in recipient_list],
                "subject": subject,
                "textContent": plain_msg,
            }
            if html_msg:
                payload["htmlContent"] = html_msg

            req = urllib.request.Request(
                "https://api.brevo.com/v3/smtp/email",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "api-key": brevo_api_key,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "SmartCampus/2.0"
                },
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=12) as response:
                resp_data = json.loads(response.read().decode("utf-8"))
                logger.info(f"[Brevo] Email successfully dispatched to {recipient_list}: {resp_data}")
                return True, {
                    "provider": "brevo_https",
                    "message": f"Student ID details successfully sent to {', '.join(recipient_list)} via Brevo.",
                    "details": resp_data,
                    "is_live_smtp": True,
                }
        except urllib.error.HTTPError as e:
            raw_body = e.read().decode("utf-8", errors="ignore")
            logger.error(f"[Brevo] HTTP Error {e.code}: {raw_body}")
            try:
                err_json = json.loads(raw_body)
                err_msg = err_json.get("message", raw_body)
            except Exception:
                err_msg = raw_body

            if "key not found" in err_msg.lower() or e.code == 401:
                friendly = (
                    "Brevo Error: 'Key not found'. Please ensure: "
                    "(1) You created a key under the 'API Keys' tab (starts with xkeysib-..., NOT xsmtpsib-...), "
                    "(2) Your Brevo account email is confirmed via the link sent to your Gmail, and "
                    "(3) There are no extra spaces or quotes around BREVO_API_KEY in Render."
                )
                return False, {
                    "provider": "brevo_https",
                    "message": friendly,
                    "error": friendly,
                    "raw_error": raw_body
                }

            return False, {
                "provider": "brevo_https",
                "message": f"Brevo API Error ({e.code}): {err_msg}",
                "error": err_msg
            }
        except Exception as e:
            logger.error(f"[Brevo] Unexpected error: {e}")
            return False, {
                "provider": "brevo_https",
                "message": f"Brevo dispatch error: {str(e)}",
                "error": str(e)
            }

    # -------------------------------------------------------------------------
    # 2. LIVE CLOUD / RENDER: RESEND REST API (HTTPS Port 443)
    # -------------------------------------------------------------------------
    resend_api_key = os.environ.get('RESEND_API_KEY', '').strip()
    if resend_api_key:
        try:
            # Resend default sandbox sender is 'onboarding@resend.dev' or custom verified domain
            resend_sender = os.environ.get('RESEND_FROM_EMAIL', '').strip()
            if not resend_sender:
                resend_sender = 'Smart Campus Academic Affairs <onboarding@resend.dev>'

            payload = {
                "from": resend_sender,
                "to": recipient_list,
                "subject": subject,
                "text": plain_msg,
            }
            if html_msg:
                payload["html"] = html_msg

            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {resend_api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "SmartCampus/2.0"
                },
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=12) as response:
                resp_data = json.loads(response.read().decode("utf-8"))
                logger.info(f"[Resend] Email successfully dispatched to {recipient_list}: {resp_data}")
                return True, {
                    "provider": "resend_https",
                    "message": f"Student ID details successfully sent to {', '.join(recipient_list)} via Resend (HTTPS).",
                    "details": resp_data,
                    "is_live_smtp": True,
                }
        except urllib.error.HTTPError as e:
            raw_body = e.read().decode("utf-8", errors="ignore")
            logger.error(f"[Resend] HTTP Error {e.code}: {raw_body}")
            try:
                err_json = json.loads(raw_body)
                err_msg = err_json.get("message", raw_body)
            except Exception:
                err_msg = raw_body
            return False, {
                "provider": "resend_https",
                "message": f"Resend API Error ({e.code}): {err_msg}",
                "error": err_msg
            }
        except Exception as e:
            logger.error(f"[Resend] Unexpected error: {e}")
            return False, {
                "provider": "resend_https",
                "message": f"Resend dispatch error: {str(e)}",
                "error": str(e)
            }

    # -------------------------------------------------------------------------
    # 3. LOCALHOST / STANDARD SMTP (Gmail Port 587)
    # -------------------------------------------------------------------------
    if not from_email:
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None)
        if not from_email:
            host_user = getattr(settings, 'EMAIL_HOST_USER', '')
            from_email = f"Academic Affairs <{host_user}>" if host_user else 'Academic Affairs <noreply@eduportal.edu>'

    is_live_smtp = bool(getattr(settings, 'EMAIL_HOST_USER', '') and getattr(settings, 'EMAIL_HOST_PASSWORD', ''))

    try:
        send_mail(
            subject=subject,
            message=plain_msg,
            from_email=from_email,
            recipient_list=recipient_list,
            html_message=html_msg,
            fail_silently=False
        )
        return True, {
            "provider": "django_smtp",
            "message": f"Student ID details successfully sent to {', '.join(recipient_list)}.",
            "is_live_smtp": is_live_smtp,
            "backend": getattr(settings, 'EMAIL_BACKEND', '')
        }
    except Exception as e:
        err_str = str(e)
        logger.warning(f"[SMTP] Error sending email to {recipient_list}: {err_str}")

        # Check for Render Free Tier SMTP port blocking (Errno 101 Network is unreachable / WSAENETUNREACH 10051)
        if "101" in err_str or "unreachable" in err_str.lower() or "10051" in err_str:
            friendly_msg = (
                "Outbound SMTP (ports 587/465) is blocked on Render's Free tier. "
                "To fix: Add RESEND_API_KEY in your Render Dashboard (Environment tab) to send via HTTPS."
            )
            return False, {
                "provider": "django_smtp",
                "message": friendly_msg,
                "error": friendly_msg,
                "raw_error": err_str
            }

        return False, {
            "provider": "django_smtp",
            "message": err_str,
            "error": err_str
        }
