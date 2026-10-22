from django.urls import path
from .views import (
    login_view,
    logout_view,
    me_view,
    manage_users_view,
    delete_user_view,
    update_profile_picture,
    activate_student_account,
    set_student_password_view,
    set_teacher_password_view,
    register_faculty_view,
    send_teacher_credentials_view,
    forgot_password_view,
    reset_password_view,
    request_activation_token,
    change_password_view,
    admin_student_activation_view,
)

urlpatterns = [
    path('login/', login_view, name='auth_login'),
    path('logout/', logout_view, name='auth_logout'),
    path('me/', me_view, name='auth_me'),
    path('activate/', activate_student_account, name='auth_activate'),
    path('set-student-password/', set_student_password_view, name='auth_set_student_password'),
    path('set-teacher-password/', set_teacher_password_view, name='auth_set_teacher_password'),
    path('faculty/register/', register_faculty_view, name='register_faculty'),
    path('teachers/<int:user_id>/send-credentials/', send_teacher_credentials_view, name='send_teacher_credentials'),
    path('forgot-password/', forgot_password_view, name='auth_forgot_password'),
    path('reset-password/', reset_password_view, name='auth_reset_password'),
    path('request-activation/', request_activation_token, name='auth_request_activation'),
    path('change-password/', change_password_view, name='auth_change_password'),
    path('students/<int:student_id>/activation/', admin_student_activation_view, name='admin_student_activation'),
    path('profile/picture/', update_profile_picture, name='update_profile_picture'),
    path('users/', manage_users_view, name='manage_users'),
    path('users/<int:user_id>/', delete_user_view, name='delete_user'),
]

