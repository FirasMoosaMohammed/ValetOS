from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    CustomTokenObtainPairView, MeView,
    StaffListCreateView, StaffDetailView,
    StartShiftView, EndShiftView, OnShiftListView,
)

urlpatterns = [
    path('login/', CustomTokenObtainPairView.as_view(), name='login'),
    path('refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('me/', MeView.as_view(), name='me'),
    path('staff/', StaffListCreateView.as_view(), name='staff-list'),
    path('staff/<int:pk>/', StaffDetailView.as_view(), name='staff-detail'),
    path('staff/<int:pk>/start-shift/', StartShiftView.as_view(), name='start-shift'),
    path('staff/<int:pk>/end-shift/', EndShiftView.as_view(), name='end-shift'),
    path('staff/on-shift/', OnShiftListView.as_view(), name='on-shift'),
]
