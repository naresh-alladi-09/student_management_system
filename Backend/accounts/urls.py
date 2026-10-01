from django.urls import path
from .views import (
    login_view,
    logout_view,
    me_view,
    manage_users_view,
    update_profile_picture,
    activate_student_account,
    request_activation_token,
    change_password_view,
    admin_student_activation_view,
)

urlpatterns = [
    path('login/', login_view, name='auth_login'),
    path('logout/', logout_view, name='auth_logout'),
    path('me/', me_view, name='auth_me'),
    path('activate/', activate_student_account, name='auth_activate'),
    path('request-activation/', request_activation_token, name='auth_request_activation'),
    path('change-password/', change_password_view, name='auth_change_password'),
    path('students/<int:student_id>/activation/', admin_student_activation_view, name='admin_student_activation'),
    path('profile/picture/', update_profile_picture, name='update_profile_picture'),
    path('users/', manage_users_view, name='manage_users'),
]

