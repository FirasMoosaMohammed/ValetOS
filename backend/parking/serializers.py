from rest_framework import serializers
from .models import (
    RFIDCard, ParkingSlot, ValetTicket, RetrievalTask,
    SlotQueue, ValetQueue, ExceptionLog, RateConfig,
    ParkingSession, OTPVerification
)
from accounts.serializers import UserSerializer


class RateConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = RateConfig
        fields = ['id', 'vehicle_type', 'rate_per_hour', 'minimum_charge', 'grace_period_minutes', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class RFIDCardSerializer(serializers.ModelSerializer):
    active_ticket_id = serializers.SerializerMethodField()
    active_ticket_status = serializers.SerializerMethodField()

    class Meta:
        model = RFIDCard
        fields = [
            'id', 'uid', 'customer_name', 'vehicle_number', 'vehicle_type',
            'phone', 'is_active', 'is_flagged', 'flag_reason',
            'is_vip', 'vip_notes',                          # Enhancement 1
            'created_at', 'active_ticket_id', 'active_ticket_status',
        ]

    def get_active_ticket_id(self, obj):
        t = obj.active_ticket
        return t.ticket_id if t else None

    def get_active_ticket_status(self, obj):
        t = obj.active_ticket
        return t.status if t else None


class ParkingSlotSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        zone = attrs.get('zone', getattr(self.instance, 'zone', 'A'))
        category = attrs.get('slot_category', getattr(self.instance, 'slot_category', 'standard'))
        if category:
            category = category.lower()
        if zone == 'VIP' and category == 'standard':
            attrs['slot_category'] = 'vip'
        elif category:
            attrs['slot_category'] = category
        return attrs

    class Meta:
        model = ParkingSlot
        fields = ['id', 'slot_code', 'zone', 'slot_type', 'slot_category', 'is_occupied', 'notes']


class RetrievalTaskSerializer(serializers.ModelSerializer):
    assigned_valet = UserSerializer(read_only=True)

    class Meta:
        model = RetrievalTask
        fields = ['id', 'assigned_valet', 'assigned_at', 'confirmed_at', 'status']


class ValetTicketSerializer(serializers.ModelSerializer):
    rfid_card = RFIDCardSerializer(read_only=True)
    slot = ParkingSlotSerializer(read_only=True)
    assigned_valet = UserSerializer(read_only=True)
    created_by = UserSerializer(read_only=True)
    retrieval_task = RetrievalTaskSerializer(read_only=True)
    duration_minutes = serializers.ReadOnlyField()
    receipt_no = serializers.ReadOnlyField()
    in_slot_queue = serializers.SerializerMethodField()
    in_valet_queue = serializers.SerializerMethodField()

    class Meta:
        model = ValetTicket
        fields = [
            'id', 'ticket_id', 'rfid_card', 'slot', 'assigned_valet', 'created_by',
            'customer_name', 'phone', 'vehicle_number', 'vehicle_type',
            'is_vip', 'slot_category', 'vip_fallback',        # Enhancement 1
            'entry_time', 'parked_at', 'retrieval_requested_at', 'exit_time',
            'status', 'fee_amount', 'payment_method', 'payment_status',
            'auto_assigned', 'is_exception', 'notes', 'created_at',
            'duration_minutes', 'receipt_no', 'retrieval_task',
            'in_slot_queue', 'in_valet_queue',
        ]

    def get_in_slot_queue(self, obj):
        try:
            q = obj.slot_queue
            return {'position': q.position, 'status': q.status}
        except Exception:
            return None

    def get_in_valet_queue(self, obj):
        try:
            q = obj.valet_queue
            return {'task_type': q.task_type, 'status': q.status}
        except Exception:
            return None


class ValetTicketListSerializer(serializers.ModelSerializer):
    slot_code = serializers.SerializerMethodField()
    zone = serializers.SerializerMethodField()
    valet_name = serializers.SerializerMethodField()
    duration_minutes = serializers.ReadOnlyField()
    receipt_no = serializers.ReadOnlyField()
    queue_position = serializers.SerializerMethodField()

    class Meta:
        model = ValetTicket
        fields = [
            'id', 'ticket_id', 'customer_name', 'phone',
            'vehicle_number', 'vehicle_type',
            'is_vip', 'slot_category', 'vip_fallback',
            'slot_code', 'zone', 'valet_name',
            'entry_time', 'parked_at', 'exit_time', 'status',
            'fee_amount', 'payment_method', 'payment_status',
            'auto_assigned', 'is_exception', 'duration_minutes',
            'receipt_no', 'queue_position',
        ]

    def get_slot_code(self, obj):
        return obj.slot.slot_code if obj.slot else None

    def get_zone(self, obj):
        return obj.slot.zone if obj.slot else None

    def get_valet_name(self, obj):
        if obj.assigned_valet:
            return obj.assigned_valet.get_full_name() or obj.assigned_valet.username
        return None

    def get_queue_position(self, obj):
        try:
            return obj.slot_queue.position
        except Exception:
            return None


class ExceptionLogSerializer(serializers.ModelSerializer):
    resolved_by = UserSerializer(read_only=True)
    ticket_id = serializers.SerializerMethodField()

    class Meta:
        model = ExceptionLog
        fields = ['id', 'type', 'ticket_id', 'rfid_uid', 'resolved_by', 'notes', 'timestamp']

    def get_ticket_id(self, obj):
        return obj.ticket.ticket_id if obj.ticket else None


# ─── Action serializers ────────────────────────────────────────────────────────

class EntrySerializer(serializers.Serializer):
    rfid_uid = serializers.CharField(max_length=100)
    customer_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    vehicle_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    vehicle_type = serializers.ChoiceField(choices=['car','suv','bike','truck','other'], required=False, default='car')
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    # Enhancement 3 — allow passing verified rfid_uid for lost-token flow
    verified_rfid_uid = serializers.CharField(max_length=100, required=False, allow_blank=True)


class ExitScanSerializer(serializers.Serializer):
    rfid_uid = serializers.CharField(max_length=100)


class CompleteExitSerializer(serializers.Serializer):
    ticket_id = serializers.CharField(max_length=30)
    payment_method = serializers.ChoiceField(choices=['cash','card','upi'], default='cash')


class LostTokenSerializer(serializers.Serializer):
    search_type = serializers.ChoiceField(choices=['phone', 'vehicle_number'])
    search_value = serializers.CharField(max_length=100)


class OTPVerifySerializer(serializers.Serializer):
    rfid_uid = serializers.CharField(max_length=100)
    otp = serializers.CharField(max_length=6, min_length=6)


# Enhancement 3 — new OTP serializers
class OTPSendSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    vehicle_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    purpose = serializers.ChoiceField(choices=['lost_token_entry','lost_token_exit'], default='lost_token_entry')

    def validate(self, data):
        if not data.get('phone') and not data.get('vehicle_number'):
            raise serializers.ValidationError("Provide phone or vehicle_number.")
        return data


class OTPVerifyNewSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20)
    otp_code = serializers.CharField(max_length=6, min_length=6)
    purpose = serializers.ChoiceField(choices=['lost_token_entry','lost_token_exit'], default='lost_token_entry')


class CustomerLookupSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    vehicle_number = serializers.CharField(max_length=20, required=False, allow_blank=True)


# ─── VIP card serializer (Enhancement 1) ──────────────────────────────────────

class RFIDCardVIPSerializer(serializers.Serializer):
    is_vip = serializers.BooleanField()
    vip_notes = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


# ─── Legacy ───────────────────────────────────────────────────────────────────

class ParkingSessionSerializer(serializers.ModelSerializer):
    duration_minutes = serializers.ReadOnlyField()
    receipt_no = serializers.ReadOnlyField()

    class Meta:
        model = ParkingSession
        fields = ['id','receipt_no','rfid_card','slot','attendant','entry_time','exit_time',
                  'status','notes','duration_minutes','fee_amount','payment_status','payment_method','auto_assigned']
