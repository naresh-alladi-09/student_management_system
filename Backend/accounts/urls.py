from django.urls import path
from .views import login_view, logout_view, me_view, manage_users_view, update_profile_picture

urlpatterns = [
    path('login/', login_view, name='auth_login'),
    path('logout/', logout_view, name='auth_logout'),
    path('me/', me_view, name='auth_me'),
    path('profile/picture/', update_profile_picture, name='update_profile_picture'),
    path('users/', manage_users_view, name='manage_users'),
]
