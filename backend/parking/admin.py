from django.contrib import admin
from .models import (
    RFIDCard, ParkingSlot, ValetTicket, RetrievalTask,
    SlotQueue, ValetQueue, ExceptionLog, RateConfig,
    OTPVerification, ParkingSession
)

@admin.register(RateConfig)
class RateConfigAdmin(admin.ModelAdmin):
    list_display = ['vehicle_type','rate_per_hour','minimum_charge','grace_period_minutes']

@admin.register(RFIDCard)
class RFIDCardAdmin(admin.ModelAdmin):
    list_display = ['uid','customer_name','vehicle_number','vehicle_type','is_active','is_flagged','is_vip']
    list_filter  = ['vehicle_type','is_active','is_flagged','is_vip']
    search_fields = ['uid','customer_name','vehicle_number','phone']

@admin.register(ParkingSlot)
class ParkingSlotAdmin(admin.ModelAdmin):
    list_display = ['slot_code','zone','slot_type','slot_category','is_occupied']
    list_filter  = ['zone','slot_type','slot_category','is_occupied']

@admin.register(ValetTicket)
class ValetTicketAdmin(admin.ModelAdmin):
    list_display = ['ticket_id','vehicle_number','customer_name','is_vip','slot','slot_category','assigned_valet','status','entry_time']
    list_filter  = ['status','vehicle_type','payment_status','is_vip']
    search_fields = ['ticket_id','vehicle_number','customer_name','phone']

@admin.register(RetrievalTask)
class RetrievalTaskAdmin(admin.ModelAdmin):
    list_display = ['ticket','assigned_valet','status','assigned_at','confirmed_at']
    list_filter  = ['status']

@admin.register(SlotQueue)
class SlotQueueAdmin(admin.ModelAdmin):
    list_display = ['position','ticket','status','created_at']

@admin.register(ValetQueue)
class ValetQueueAdmin(admin.ModelAdmin):
    list_display = ['ticket','task_type','status','created_at']

@admin.register(ExceptionLog)
class ExceptionLogAdmin(admin.ModelAdmin):
    list_display = ['type','rfid_uid','ticket','resolved_by','timestamp']
    list_filter  = ['type']

@admin.register(OTPVerification)
class OTPVerificationAdmin(admin.ModelAdmin):
    list_display = ['phone','purpose','is_used','attempts','created_at','expires_at','verified_at']
    list_filter  = ['purpose','is_used']

@admin.register(ParkingSession)
class ParkingSessionAdmin(admin.ModelAdmin):
    list_display = ['id','rfid_card','slot','attendant','status','entry_time']
