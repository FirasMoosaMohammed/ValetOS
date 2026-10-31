from django.urls import path
from .views import (
    RFIDCardListCreateView, RFIDCardLookupView, RFIDCardFlagView, RFIDCardVIPView,
    ParkingSlotListCreateView, ParkingSlotDetailView, AvailableSlotsView, SlotMapView,
    TicketEntryView, ExitScanView, CompleteExitView, HandoverView,
    TicketListView, TicketDetailView, TicketReceiptView,
    MyTasksView, ConfirmParkedView, ConfirmRetrievedView,
    RateConfigListView,
    ExceptionLogListView, LostTokenView, OTPVerifyView,
    OTPSendView, OTPVerifyNewView, CustomerLookupView,
    DashboardStatsView, ValetHistoryView, TicketExportView,
)

urlpatterns = [
    # RFID
    path('rfid-cards/', RFIDCardListCreateView.as_view()),
    path('rfid-cards/<str:uid>/lookup/', RFIDCardLookupView.as_view()),
    path('rfid-cards/<int:pk>/flag/', RFIDCardFlagView.as_view()),
    path('rfid-cards/<int:pk>/vip/', RFIDCardVIPView.as_view()),   # Enhancement 1

    # Slots
    path('slots/', ParkingSlotListCreateView.as_view()),
    path('slots/available/', AvailableSlotsView.as_view()),
    path('slots/map/', SlotMapView.as_view()),
    path('slots/<int:pk>/', ParkingSlotDetailView.as_view()),

    # Tickets
    path('tickets/', TicketListView.as_view()),
    path('tickets/entry/', TicketEntryView.as_view()),
    path('tickets/exit-scan/', ExitScanView.as_view()),
    path('tickets/complete-exit/', CompleteExitView.as_view()),
    path('tickets/export/', TicketExportView.as_view()),
    path('tickets/<int:pk>/', TicketDetailView.as_view()),
    path('tickets/<int:pk>/handover/', HandoverView.as_view()),
    path('tickets/<int:pk>/receipt/', TicketReceiptView.as_view()),

    # Valet tasks
    path('tasks/my-tasks/', MyTasksView.as_view()),
    path('tasks/<int:pk>/confirm-parked/', ConfirmParkedView.as_view()),
    path('tasks/<int:pk>/confirm-retrieved/', ConfirmRetrievedView.as_view()),

    # Rates
    path('rates/', RateConfigListView.as_view()),

    # Exceptions (legacy endpoints kept)
    path('exceptions/', ExceptionLogListView.as_view()),
    path('exceptions/lost-token/', LostTokenView.as_view()),
    path('exceptions/verify-otp/', OTPVerifyView.as_view()),

    # Enhancement 3 — new OTP endpoints
    path('otp/send/', OTPSendView.as_view()),
    path('otp/verify/', OTPVerifyNewView.as_view()),
    path('otp/customer-lookup/', CustomerLookupView.as_view()),

    # Dashboard & history
    path('dashboard/stats/', DashboardStatsView.as_view()),
    path('valet/history/', ValetHistoryView.as_view()),
]
