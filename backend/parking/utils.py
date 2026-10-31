"""
parking/utils.py — Assignment utilities, fee calculation, queue processing, SMS.
All slot/valet assignment MUST be called inside a single atomic transaction.
"""
import math
import secrets
from decimal import Decimal
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.timezone import localdate


# ─── Vehicle → slot type mapping ──────────────────────────────────────────────

def _vehicle_type_to_slot_type(vehicle_type: str) -> str:
    return {'bike':'bike','car':'car','suv':'car','truck':'van','other':'any'}.get(vehicle_type, 'any')


# ─── Slot Assignment (Enhancement 1: VIP-aware) ───────────────────────────────

def assign_slot(vehicle_type: str, is_vip: bool = False):
    """
    Return (ParkingSlot | None, vip_fallback: bool).

    VIP customer priority:
      1. VIP slots matching vehicle_type
      2. VIP slots with slot_type='any'
      3. Fallback to standard slots (logs ExceptionLog)
      4. None → queue

    Regular customer priority:
      1. Standard slots matching vehicle_type
      2. Standard slots slot_type='any'
      3. NEVER VIP slots
      4. None → queue

    Caller MUST be inside an atomic transaction.
    This helper also marks the chosen slot occupied before returning it so
    every caller follows the same locking and persistence path.
    """
    from .models import ParkingSlot

    specific = _vehicle_type_to_slot_type(vehicle_type)
    # Build base free queryset WITHOUT select_for_update — we apply the lock
    # only on the final narrow candidates to avoid locking every free slot row.
    free = ParkingSlot.objects.filter(is_occupied=False)

    vip_fallback = False

    if is_vip:
        # Try VIP slots first. Use case-insensitive matching so legacy rows
        # like "VIP" still behave correctly.
        vip_free = free.filter(slot_category__iexact='vip')
        if specific != 'any':
            candidates = vip_free.filter(slot_type=specific)
            if not candidates.exists():
                candidates = vip_free.filter(slot_type='any')
        else:
            candidates = vip_free

        if not candidates.exists():
            # All VIP slots full — fall back to standard
            vip_fallback = True
            std_free = free.filter(slot_category__iexact='standard')
            if specific != 'any':
                candidates = std_free.filter(slot_type=specific)
                if not candidates.exists():
                    candidates = std_free.filter(slot_type='any')
            else:
                candidates = std_free
    else:
        # Regular customer: standard slots ONLY
        std_free = free.filter(slot_category__iexact='standard')
        if specific != 'any':
            candidates = std_free.filter(slot_type=specific)
            if not candidates.exists():
                candidates = std_free.filter(slot_type='any')
        else:
            candidates = std_free

    if not candidates.exists():
        return None, False

    # Load-balance: zone with most free, then lowest slot_code
    zone_counts = candidates.values('zone').annotate(n=Count('id')).order_by('-n', 'zone')
    if not zone_counts:
        return None, False

    best_zone = zone_counts[0]['zone']
    # Apply select_for_update only on the single best-zone candidates — minimal lock scope
    slot = candidates.filter(zone=best_zone).select_for_update().order_by('slot_code').first()
    if slot is None:
        return None, False

    slot.is_occupied = True
    slot.save(update_fields=['is_occupied'])
    return slot, vip_fallback


# ─── Attendant Assignment ──────────────────────────────────────────────────────

def assign_attendant(fallback_user):
    """Return (User, was_auto_assigned)."""
    from accounts.models import User
    today = localdate()
    on_shift = (
        User.objects
        .filter(role='attendant', is_active=True, is_on_shift=True)
        .annotate(
            active_tasks=Count('assigned_tickets', filter=Q(assigned_tickets__status__in=['valet_assigned','parked','retrieval_pending'])),
            today_tasks=Count('assigned_tickets', filter=Q(assigned_tickets__entry_time__date=today)),
        )
        .order_by('active_tasks', 'today_tasks', 'last_assigned_at')
    )
    best = on_shift.first()
    if best is None:
        return (fallback_user, False)
    return (best, True)


# ─── Fee Calculation ───────────────────────────────────────────────────────────

def calculate_fee(vehicle_type: str, duration_minutes: int) -> Decimal:
    from .models import RateConfig
    return RateConfig.get_for_vehicle(vehicle_type).calculate_fee(duration_minutes)


def fee_breakdown(vehicle_type: str, duration_minutes: int) -> dict:
    from .models import RateConfig
    rate = RateConfig.get_for_vehicle(vehicle_type)
    grace = rate.grace_period_minutes
    if duration_minutes <= grace:
        billable_minutes = 0
    else:
        billable_minutes = math.ceil((duration_minutes - grace) / 15) * 15

    billable_hours = Decimal(str(billable_minutes)) / Decimal('60')
    computed = (billable_hours * rate.rate_per_hour).quantize(Decimal('0.01'))
    total = max(computed, rate.minimum_charge) if billable_minutes > 0 else Decimal('0.00')

    return {
        'total_minutes':    duration_minutes,
        'grace_minutes':    grace,
        'billable_minutes': billable_minutes,
        'billable_hours':   str(billable_hours.quantize(Decimal('0.01'))),
        'rate_per_hour':    str(rate.rate_per_hour),
        'minimum_charge':   str(rate.minimum_charge),
        'computed_fee':     str(computed),
        'total_fee':        str(total),
    }


# ─── OTP Generation (Enhancement 3) ───────────────────────────────────────────

def generate_otp() -> str:
    """Cryptographically secure 6-digit OTP."""
    return str(secrets.randbelow(900000) + 100000)


def send_sms(phone: str, otp: str) -> bool:
    """
    Send OTP via SMS. In development mode, just logs the OTP.
    In production, plug in one of:

    ── Twilio ────────────────────────────────────────────────────
    from twilio.rest import Client
    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    client.messages.create(
        to=phone,
        from_=settings.TWILIO_PHONE,
        body=f"Your ValetOS verification code is: {otp}. Valid for 10 minutes."
    )

    ── AWS SNS ───────────────────────────────────────────────────
    import boto3
    sns = boto3.client('sns', region_name='ap-south-1')
    sns.publish(PhoneNumber=phone, Message=f"ValetOS OTP: {otp}")

    ── Fast2SMS (India) ──────────────────────────────────────────
    import requests
    requests.post("https://www.fast2sms.com/dev/bulkV2",
        headers={"authorization": settings.FAST2SMS_API_KEY},
        data={"variables_values": otp, "route": "otp", "numbers": phone}
    )

    ── Textlocal (India) ─────────────────────────────────────────
    import requests
    requests.post("https://api.textlocal.in/send/",
        data={"apikey": settings.TEXTLOCAL_KEY, "numbers": phone,
              "message": f"ValetOS OTP: {otp}", "sender": "VTLOS"}
    )
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[DEV] OTP for {phone}: {otp}")
    # In production: remove the line above and uncomment your SMS provider block
    return True


# ─── Slot Queue Processing ────────────────────────────────────────────────────

def process_slot_queue():
    """Called inside atomic transaction when a slot is freed."""
    from .models import SlotQueue

    waiting = SlotQueue.objects.select_for_update().filter(status='waiting').order_by('position').first()
    if not waiting:
        return None

    ticket = waiting.ticket
    is_vip = ticket.is_vip
    slot, vip_fallback = assign_slot(ticket.vehicle_type, is_vip=is_vip)
    if slot is None:
        return None

    ticket.slot = slot
    ticket.slot_category = (slot.slot_category or 'standard').lower()
    ticket.vip_fallback = vip_fallback
    ticket.status = 'valet_assigned'
    ticket.save(update_fields=['slot', 'slot_category', 'vip_fallback', 'status'])

    waiting.status = 'assigned'
    waiting.save(update_fields=['status'])

    return ticket


# ─── Valet Queue Processing ───────────────────────────────────────────────────

def process_valet_queue(fallback_user):
    """Called inside atomic transaction when a valet starts their shift."""
    from .models import ValetQueue

    waiting = ValetQueue.objects.select_for_update().filter(status='waiting').order_by('created_at').first()
    if not waiting:
        return None

    ticket = waiting.ticket
    valet, auto = assign_attendant(fallback_user)

    ticket.assigned_valet = valet
    ticket.status = 'valet_assigned'
    ticket.save(update_fields=['assigned_valet', 'status'])

    valet.last_assigned_at = timezone.now()
    valet.save(update_fields=['last_assigned_at'])

    waiting.status = 'assigned'
    waiting.save(update_fields=['status'])

    return ticket
