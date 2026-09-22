from django.urls import path
from .views import login_view, logout_view, me_view, manage_users_view

urlpatterns = [
    path('login/', login_view, name='auth_login'),
    path('logout/', logout_view, name='auth_logout'),
    path('me/', me_view, name='auth_me'),
    path('users/', manage_users_view, name='manage_users'),
]
