from django.db import models
from django.conf import settings
from django.utils import timezone
from decimal import Decimal
import random
import string


VEHICLE_TYPE_CHOICES = [
    ('car',   'Car'),
    ('suv',   'SUV'),
    ('bike',  'Bike'),
    ('truck', 'Truck'),
    ('other', 'Other'),
]


def generate_ticket_id():
    from django.utils import timezone as tz
    today = tz.localdate()
    suffix = ''.join(random.choices(string.digits, k=4))
    return f"VLT-{today.strftime('%Y%m%d')}-{suffix}"


# ─── Rate Config ──────────────────────────────────────────────────────────────

class RateConfig(models.Model):
    vehicle_type = models.CharField(max_length=20, choices=VEHICLE_TYPE_CHOICES, unique=True)
    rate_per_hour = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('50.00'))
    minimum_charge = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('20.00'))
    grace_period_minutes = models.PositiveIntegerField(default=15)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.vehicle_type} – ₹{self.rate_per_hour}/hr"

    @classmethod
    def get_for_vehicle(cls, vehicle_type):
        obj, _ = cls.objects.get_or_create(
            vehicle_type=vehicle_type,
            defaults={'rate_per_hour': Decimal('50.00'), 'minimum_charge': Decimal('20.00'), 'grace_period_minutes': 15}
        )
        return obj

    def calculate_fee(self, duration_minutes):
        import math
        grace = self.grace_period_minutes
        if duration_minutes <= grace:
            return Decimal('0.00')
        billable_minutes = math.ceil((duration_minutes - grace) / 15) * 15
        billable_hours = Decimal(str(billable_minutes)) / Decimal('60')
        fee = billable_hours * self.rate_per_hour
        return max(fee, self.minimum_charge).quantize(Decimal('0.01'))


# ─── RFID Card ────────────────────────────────────────────────────────────────

class RFIDCard(models.Model):
    uid = models.CharField(max_length=100, unique=True)
    customer_name = models.CharField(max_length=150)
    vehicle_number = models.CharField(max_length=20)
    vehicle_type = models.CharField(max_length=20, choices=VEHICLE_TYPE_CHOICES, default='car')
    phone = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    is_flagged = models.BooleanField(default=False)
    flag_reason = models.CharField(max_length=200, blank=True)
    # Enhancement 1 — VIP
    is_vip = models.BooleanField(default=False)
    vip_notes = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.uid} – {self.customer_name} ({self.vehicle_number})"

    @property
    def active_ticket(self):
        return self.tickets.filter(
            status__in=['checked_in', 'queued_slot', 'queued_valet', 'valet_assigned',
                        'parked', 'retrieval_pending', 'retrieved']
        ).first()

    @property
    def active_session(self):
        return self.active_ticket


# ─── Parking Slot ─────────────────────────────────────────────────────────────

class ParkingSlot(models.Model):
    ZONE_CHOICES = [
        ('A',   'Zone A'), ('B',   'Zone B'), ('C',   'Zone C'),
        ('D',   'Zone D'), ('VIP', 'VIP Zone'),
    ]
    SLOT_TYPE_CHOICES = [
        ('any',  'Any Vehicle'), ('bike', 'Bike Only'),
        ('car',  'Car / SUV'),   ('van',  'Van / Truck'),
    ]
    # Enhancement 1 — slot category
    SLOT_CATEGORY_CHOICES = [
        ('standard', 'Standard'),
        ('vip',      'VIP'),
        ('disabled', 'Disabled'),
    ]
    slot_code = models.CharField(max_length=10, unique=True)
    zone = models.CharField(max_length=10, choices=ZONE_CHOICES, default='A')
    slot_type = models.CharField(max_length=10, choices=SLOT_TYPE_CHOICES, default='any')
    slot_category = models.CharField(max_length=20, choices=SLOT_CATEGORY_CHOICES, default='standard')
    is_occupied = models.BooleanField(default=False)
    notes = models.CharField(max_length=200, blank=True)

    def save(self, *args, **kwargs):
        if self.slot_category:
            self.slot_category = self.slot_category.lower()
        if self.zone == 'VIP' and self.slot_category == 'standard':
            self.slot_category = 'vip'
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.slot_code} ({self.zone}/{self.slot_category}) – {'Occ' if self.is_occupied else 'Free'}"

    class Meta:
        ordering = ['zone', 'slot_code']


# ─── Valet Ticket ─────────────────────────────────────────────────────────────

class ValetTicket(models.Model):
    STATUS_CHOICES = [
        ('checked_in',        'Checked In'),
        ('queued_slot',       'Queued – No Slot'),
        ('queued_valet',      'Queued – No Valet'),
        ('valet_assigned',    'Valet Assigned'),
        ('parked',            'Parked'),
        ('retrieval_pending', 'Retrieval Pending'),
        ('retrieved',         'Vehicle Retrieved'),
        ('completed',         'Completed'),
        ('cancelled',         'Cancelled'),
    ]
    PAYMENT_METHOD_CHOICES = [
        ('cash','Cash'), ('card','Card'), ('upi','UPI'), ('','Not set'),
    ]
    PAYMENT_STATUS_CHOICES = [
        ('pending','Pending'), ('paid','Paid'), ('waived','Waived'),
    ]

    ticket_id = models.CharField(max_length=30, unique=True, default=generate_ticket_id)
    rfid_card = models.ForeignKey(RFIDCard, on_delete=models.PROTECT, related_name='tickets', null=True, blank=True)
    slot = models.ForeignKey(ParkingSlot, on_delete=models.SET_NULL, null=True, blank=True, related_name='tickets')
    assigned_valet = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_tickets')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_tickets')

    customer_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True)
    vehicle_number = models.CharField(max_length=20)
    vehicle_type = models.CharField(max_length=20, choices=VEHICLE_TYPE_CHOICES, default='car')

    # Enhancement 1 — VIP snapshot
    is_vip = models.BooleanField(default=False)
    slot_category = models.CharField(max_length=20, default='standard')
    vip_fallback = models.BooleanField(default=False)  # True = VIP customer got standard slot

    entry_time = models.DateTimeField(default=timezone.now)
    parked_at = models.DateTimeField(null=True, blank=True)
    retrieval_requested_at = models.DateTimeField(null=True, blank=True)
    exit_time = models.DateTimeField(null=True, blank=True)

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='checked_in')

    fee_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, blank=True, default='')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')

    auto_assigned = models.BooleanField(default=True)
    is_exception = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.ticket_id} – {self.vehicle_number} [{self.status}]"

    @property
    def duration_minutes(self):
        end = self.exit_time or timezone.now()
        return int((end - self.entry_time).total_seconds() / 60)

    @property
    def receipt_no(self):
        return self.ticket_id

    class Meta:
        ordering = ['-entry_time']


# ─── Retrieval Task ────────────────────────────────────────────────────────────

class RetrievalTask(models.Model):
    STATUS_CHOICES = [('pending','Pending'), ('retrieved','Retrieved'), ('cancelled','Cancelled')]
    ticket = models.OneToOneField(ValetTicket, on_delete=models.CASCADE, related_name='retrieval_task')
    assigned_valet = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='retrieval_tasks')
    assigned_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    def __str__(self):
        return f"Retrieve {self.ticket.vehicle_number}"


# ─── Slot Queue ────────────────────────────────────────────────────────────────

class SlotQueue(models.Model):
    STATUS_CHOICES = [('waiting','Waiting'), ('assigned','Assigned'), ('cancelled','Cancelled')]
    ticket = models.OneToOneField(ValetTicket, on_delete=models.CASCADE, related_name='slot_queue')
    position = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='waiting')

    class Meta:
        ordering = ['position']


# ─── Valet Queue ───────────────────────────────────────────────────────────────

class ValetQueue(models.Model):
    TASK_TYPE_CHOICES = [('park','Park'), ('retrieve','Retrieve')]
    STATUS_CHOICES = [('waiting','Waiting'), ('assigned','Assigned'), ('cancelled','Cancelled')]
    ticket = models.OneToOneField(ValetTicket, on_delete=models.CASCADE, related_name='valet_queue')
    task_type = models.CharField(max_length=20, choices=TASK_TYPE_CHOICES, default='park')
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='waiting')

    class Meta:
        ordering = ['created_at']


# ─── Exception Log ─────────────────────────────────────────────────────────────

class ExceptionLog(models.Model):
    TYPE_CHOICES = [
        ('lost_rfid',           'Lost RFID'),
        ('unknown_rfid',        'Unknown RFID'),
        ('flagged_rfid',        'Flagged RFID'),
        ('no_slots',            'No Slots Available'),
        ('no_valet',            'No Valet Available'),
        ('otp_verified',        'OTP Verified'),
        ('manual_override',     'Manual Override'),
        ('vip_slot_unavailable','VIP Slot Unavailable'),  # Enhancement 1
        ('lost_token_entry',    'Lost Token – Entry'),    # Enhancement 3
        ('lost_token_exit',     'Lost Token – Exit'),     # Enhancement 3
    ]
    type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    ticket = models.ForeignKey(ValetTicket, on_delete=models.SET_NULL, null=True, blank=True, related_name='exceptions')
    rfid_uid = models.CharField(max_length=100, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='resolved_exceptions')
    notes = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.type} @ {self.timestamp:%Y-%m-%d %H:%M}"

    class Meta:
        ordering = ['-timestamp']


# ─── OTP Verification (Enhancement 3) ─────────────────────────────────────────

class OTPVerification(models.Model):
    PURPOSE_CHOICES = [
        ('lost_token_entry', 'Lost Token – Entry'),
        ('lost_token_exit',  'Lost Token – Exit'),
    ]
    phone = models.CharField(max_length=20)
    otp_code = models.CharField(max_length=6)
    ticket = models.ForeignKey(ValetTicket, on_delete=models.SET_NULL, null=True, blank=True, related_name='otp_verifications')
    purpose = models.CharField(max_length=30, choices=PURPOSE_CHOICES, default='lost_token_entry')
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    attempts = models.IntegerField(default=0)
    verified_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"OTP for {self.phone} [{self.purpose}]"

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    class Meta:
        ordering = ['-created_at']


# ─── ParkingSession (legacy) ───────────────────────────────────────────────────

class ParkingSession(models.Model):
    """Legacy model – kept for DB integrity."""
    STATUS_CHOICES = [('active','Active'), ('completed','Completed')]
    PAYMENT_STATUS_CHOICES = [('pending','Pending'), ('paid','Paid'), ('waived','Waived')]
    PAYMENT_METHOD_CHOICES = [('cash','Cash'), ('card','Card'), ('upi','UPI'), ('','Not set')]

    rfid_card = models.ForeignKey(RFIDCard, on_delete=models.PROTECT, related_name='sessions')
    slot = models.ForeignKey(ParkingSlot, on_delete=models.PROTECT, related_name='sessions')
    attendant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='sessions_handled')
    entry_time = models.DateTimeField(default=timezone.now)
    exit_time = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    notes = models.TextField(blank=True)
    fee_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, blank=True, default='')
    auto_assigned = models.BooleanField(default=True)

    @property
    def duration_minutes(self):
        end = self.exit_time or timezone.now()
        return int((end - self.entry_time).total_seconds() / 60)

    @property
    def receipt_no(self):
        return f"VP{self.id:06d}"

    class Meta:
        ordering = ['-entry_time']
