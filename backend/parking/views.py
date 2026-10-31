import random
import csv
import io
from decimal import Decimal
from django.conf import settings as django_settings

from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils.timezone import localdate
from django.http import StreamingHttpResponse, HttpResponse

from accounts.permissions import IsAdminRole, IsAdminOrValet
from .models import (
    RFIDCard, ParkingSlot, ValetTicket, RetrievalTask,
    SlotQueue, ValetQueue, ExceptionLog, RateConfig, OTPVerification
)
from .serializers import (
    RFIDCardSerializer, ParkingSlotSerializer,
    ValetTicketSerializer, ValetTicketListSerializer,
    RetrievalTaskSerializer, ExceptionLogSerializer,
    RateConfigSerializer, EntrySerializer, ExitScanSerializer,
    CompleteExitSerializer, LostTokenSerializer, OTPVerifySerializer,
    RFIDCardVIPSerializer, OTPSendSerializer, OTPVerifyNewSerializer,
    CustomerLookupSerializer,
)
from .utils import (
    assign_slot, assign_attendant, calculate_fee, fee_breakdown,
    process_slot_queue, process_valet_queue, generate_otp, send_sms,
)

# Legacy in-memory OTP (kept for backward compat with old verify endpoint)
_otp_store = {}


# ─── RFID Cards ───────────────────────────────────────────────────────────────

class RFIDCardListCreateView(generics.ListCreateAPIView):
    serializer_class = RFIDCardSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get_queryset(self):
        qs = RFIDCard.objects.all().order_by('-created_at')
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(uid__icontains=search) | Q(customer_name__icontains=search) |
                Q(vehicle_number__icontains=search) | Q(phone__icontains=search)
            )
        return qs


class RFIDCardLookupView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, uid):
        try:
            card = RFIDCard.objects.get(uid=uid)
        except RFIDCard.DoesNotExist:
            return Response({'found': False, 'uid': uid}, status=status.HTTP_200_OK)

        if card.is_flagged:
            ExceptionLog.objects.create(type='flagged_rfid', rfid_uid=uid, notes=f"Flagged card scanned: {card.flag_reason}")
            return Response({'found': True, 'flagged': True, 'flag_reason': card.flag_reason, 'card': RFIDCardSerializer(card).data})

        active = card.active_ticket
        data = RFIDCardSerializer(card).data
        if active:
            ticket_data = ValetTicketListSerializer(active).data
            rate = RateConfig.get_for_vehicle(card.vehicle_type)
            ticket_data['fee_preview'] = str(rate.calculate_fee(active.duration_minutes))
            ticket_data['fee_breakdown'] = fee_breakdown(card.vehicle_type, active.duration_minutes)
            data['active_ticket'] = ticket_data

        return Response({'found': True, 'flagged': False, 'card': data})


class RFIDCardFlagView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        try:
            card = RFIDCard.objects.get(pk=pk)
        except RFIDCard.DoesNotExist:
            return Response({'error': 'Card not found.'}, status=status.HTTP_404_NOT_FOUND)
        flag = request.data.get('is_flagged', True)
        reason = request.data.get('flag_reason', '')
        card.is_flagged = flag
        card.flag_reason = reason
        card.save(update_fields=['is_flagged', 'flag_reason'])
        if flag:
            ExceptionLog.objects.create(type='flagged_rfid', rfid_uid=card.uid, resolved_by=request.user, notes=reason)
        return Response(RFIDCardSerializer(card).data)


# Enhancement 1 — VIP toggle
class RFIDCardVIPView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def patch(self, request, pk):
        try:
            card = RFIDCard.objects.get(pk=pk)
        except RFIDCard.DoesNotExist:
            return Response({'error': 'Card not found.'}, status=status.HTTP_404_NOT_FOUND)
        ser = RFIDCardVIPSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        card.is_vip = ser.validated_data['is_vip']
        card.vip_notes = ser.validated_data.get('vip_notes', '')
        card.save(update_fields=['is_vip', 'vip_notes'])
        return Response(RFIDCardSerializer(card).data)


# ─── Parking Slots ────────────────────────────────────────────────────────────

class ParkingSlotListCreateView(generics.ListCreateAPIView):
    serializer_class = ParkingSlotSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ParkingSlot.objects.all()
        zone = self.request.query_params.get('zone')
        occupied = self.request.query_params.get('occupied')
        category = self.request.query_params.get('category')
        if zone:
            qs = qs.filter(zone=zone)
        if occupied is not None:
            qs = qs.filter(is_occupied=occupied.lower() == 'true')
        if category:
            qs = qs.filter(slot_category__iexact=category)
        return qs

    def perform_create(self, serializer):
        if self.request.user.role != 'admin':
            raise PermissionDenied("Only admins can create slots.")
        serializer.save()

    def create(self, request, *args, **kwargs):
        if request.user.role != 'admin':
            raise PermissionDenied("Only admins can create slots.")
        return super().create(request, *args, **kwargs)


class ParkingSlotDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ParkingSlotSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]
    queryset = ParkingSlot.objects.all()

    def perform_destroy(self, instance):
        if instance.is_occupied:
            from rest_framework.exceptions import ValidationError
            raise ValidationError("Cannot delete an occupied slot.")
        instance.delete()


class AvailableSlotsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .utils import _vehicle_type_to_slot_type
        vehicle_type = request.query_params.get('vehicle_type', 'any')
        is_vip = request.query_params.get('is_vip', 'false').lower() == 'true'
        specific = _vehicle_type_to_slot_type(vehicle_type)
        free = ParkingSlot.objects.filter(is_occupied=False)

        if is_vip:
            vip_free = free.filter(slot_category__iexact='vip')
            candidates = vip_free.filter(slot_type=specific) if specific != 'any' else vip_free
            if not candidates.exists():
                candidates = vip_free.filter(slot_type='any')
        else:
            std_free = free.filter(slot_category__iexact='standard')
            candidates = std_free.filter(slot_type=specific) if specific != 'any' else std_free
            if not candidates.exists():
                candidates = std_free.filter(slot_type='any')

        return Response({
            'vehicle_type': vehicle_type,
            'is_vip': is_vip,
            'total_available': candidates.count(),
            'slots': ParkingSlotSerializer(candidates.order_by('zone', 'slot_code')[:50], many=True).data,
        })


class SlotMapView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        slots = ParkingSlot.objects.all().order_by('zone', 'slot_code')
        result = []
        for slot in slots:
            entry = {
                'id': slot.id, 'slot_code': slot.slot_code,
                'zone': slot.zone, 'slot_type': slot.slot_type,
                'slot_category': (slot.slot_category or 'standard').lower(),
                'is_occupied': slot.is_occupied,
                'vehicle_number': None, 'customer_name': None,
                'vehicle_type': None, 'entry_time': None,
                'duration_minutes': None, 'ticket_id': None,
                'is_vip_ticket': None,
            }
            if slot.is_occupied:
                t = slot.tickets.filter(status__in=['parked','retrieval_pending','retrieved']).select_related('rfid_card').first()
                if t:
                    entry.update({
                        'vehicle_number': t.vehicle_number,
                        'customer_name': t.customer_name,
                        'vehicle_type': t.vehicle_type,
                        'entry_time': t.entry_time.isoformat(),
                        'duration_minutes': t.duration_minutes,
                        'ticket_id': t.ticket_id,
                        'is_vip_ticket': t.is_vip,
                    })
            result.append(entry)
        return Response(result)


# ─── Ticket Entry (Enhancement 1: VIP-aware assignment) ──────────────────────

class TicketEntryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = EntrySerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        rfid_uid = ser.validated_data['rfid_uid'].strip()
        notes = ser.validated_data.get('notes', '')

        # Enhancement 3: lost-token verified card override
        verified_rfid_uid = ser.validated_data.get('verified_rfid_uid', '').strip()
        if verified_rfid_uid:
            rfid_uid = verified_rfid_uid

        try:
            card = RFIDCard.objects.get(uid=rfid_uid)
        except RFIDCard.DoesNotExist:
            customer_name = ser.validated_data.get('customer_name', '').strip()
            vehicle_number = ser.validated_data.get('vehicle_number', '').strip().upper()
            vehicle_type = ser.validated_data.get('vehicle_type', 'car')
            phone = ser.validated_data.get('phone', '').strip()
            if not customer_name or not vehicle_number:
                return Response({'error': 'new_customer', 'message': 'Card not found. Provide customer details to register.'}, status=status.HTTP_404_NOT_FOUND)
            card = RFIDCard.objects.create(uid=rfid_uid, customer_name=customer_name, vehicle_number=vehicle_number, vehicle_type=vehicle_type, phone=phone)
            ExceptionLog.objects.create(type='manual_override', rfid_uid=rfid_uid, resolved_by=request.user, notes=f"New customer: {customer_name}")
        else:
            if card.is_flagged:
                ExceptionLog.objects.create(type='flagged_rfid', rfid_uid=rfid_uid, resolved_by=request.user, notes="Flagged card at entry")
                return Response({'error': 'flagged_rfid', 'message': f'Card flagged: {card.flag_reason}'}, status=status.HTTP_403_FORBIDDEN)
            if not card.is_active:
                return Response({'error': 'Card is deactivated.'}, status=status.HTTP_400_BAD_REQUEST)
            if card.active_ticket:
                return Response({'error': f'Vehicle {card.vehicle_number} already has an active ticket.'}, status=status.HTTP_409_CONFLICT)

        is_vip = card.is_vip  # Enhancement 1
        slot = None
        valet = None
        was_auto = True
        slot_queued = False
        valet_queued = False
        vip_fallback = False

        try:
            with transaction.atomic():
                slot, vip_fallback = assign_slot(card.vehicle_type, is_vip=is_vip)
                valet, was_auto = assign_attendant(request.user)

                ticket = ValetTicket.objects.create(
                    rfid_card=card, slot=slot,
                    assigned_valet=valet if slot else None,
                    created_by=request.user,
                    customer_name=card.customer_name, phone=card.phone,
                    vehicle_number=card.vehicle_number, vehicle_type=card.vehicle_type,
                    is_vip=is_vip,
                    slot_category=(slot.slot_category or 'standard').lower() if slot else 'standard',
                    vip_fallback=vip_fallback,
                    notes=notes, auto_assigned=was_auto, status='checked_in',
                )

                if slot:
                    if vip_fallback:
                        ExceptionLog.objects.create(type='vip_slot_unavailable', ticket=ticket, notes=f"VIP customer {card.customer_name} got standard slot {slot.slot_code}")
                    if valet:
                        ticket.status = 'valet_assigned'
                        valet.last_assigned_at = timezone.now()
                        valet.save(update_fields=['last_assigned_at'])
                    else:
                        ticket.status = 'queued_valet'
                        ValetQueue.objects.create(ticket=ticket, task_type='park')
                        valet_queued = True
                        ExceptionLog.objects.create(type='no_valet', ticket=ticket, notes="No valet on shift; queued")
                else:
                    ticket.status = 'queued_slot'
                    next_pos = SlotQueue.objects.filter(status='waiting').count() + 1
                    SlotQueue.objects.create(ticket=ticket, position=next_pos)
                    slot_queued = True
                    ExceptionLog.objects.create(type='no_slots', ticket=ticket, notes="No slots; queued")

                ticket.save()

        except Exception as e:
            return Response({'error': 'Entry processing failed.', 'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        response_data = ValetTicketSerializer(ticket).data
        response_data['slot_queued'] = slot_queued
        response_data['valet_queued'] = valet_queued
        response_data['vip_fallback'] = vip_fallback
        response_data['is_vip_fallback'] = vip_fallback
        response_data['slot_category'] = (ticket.slot_category or 'standard').lower()
        if slot_queued:
            q = SlotQueue.objects.filter(ticket=ticket).first()
            response_data['queue_position'] = q.position if q else None

        return Response(response_data, status=status.HTTP_201_CREATED)


# ─── Exit Scan ────────────────────────────────────────────────────────────────

class ExitScanView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = ExitScanSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        uid = ser.validated_data['rfid_uid'].strip()
        try:
            card = RFIDCard.objects.get(uid=uid)
        except RFIDCard.DoesNotExist:
            return Response({'error': 'Card not found.'}, status=status.HTTP_404_NOT_FOUND)
        ticket = card.active_ticket
        if not ticket:
            return Response({'error': 'No active ticket.'}, status=status.HTTP_404_NOT_FOUND)
        if ticket.status != 'parked':
            return Response({'error': f'Ticket status: {ticket.status}. Only parked vehicles can exit.'}, status=status.HTTP_400_BAD_REQUEST)
        breakdown = fee_breakdown(ticket.vehicle_type, ticket.duration_minutes)
        data = ValetTicketSerializer(ticket).data
        data['fee_breakdown'] = breakdown
        return Response(data)


# ─── Complete Exit ────────────────────────────────────────────────────────────

class CompleteExitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = CompleteExitSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        ticket_id = ser.validated_data['ticket_id']
        payment_method = ser.validated_data['payment_method']
        try:
            ticket = ValetTicket.objects.select_related('rfid_card', 'slot').get(ticket_id=ticket_id)
        except ValetTicket.DoesNotExist:
            return Response({'error': 'Ticket not found.'}, status=status.HTTP_404_NOT_FOUND)
        if ticket.status != 'parked':
            return Response({'error': f'Cannot exit. Status: {ticket.status}'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            fee = calculate_fee(ticket.vehicle_type, ticket.duration_minutes)
            ticket.fee_amount = fee
            ticket.payment_method = payment_method
            ticket.payment_status = 'paid'
            ticket.retrieval_requested_at = timezone.now()
            ticket.status = 'retrieval_pending'
            ticket.save()
            valet, auto = assign_attendant(request.user)
            RetrievalTask.objects.create(ticket=ticket, assigned_valet=valet, status='pending')
            ticket.assigned_valet = valet
            ticket.save(update_fields=['assigned_valet'])
            if valet:
                valet.last_assigned_at = timezone.now()
                valet.save(update_fields=['last_assigned_at'])
        return Response(ValetTicketSerializer(ticket).data)


# ─── Handover ─────────────────────────────────────────────────────────────────

class HandoverView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            ticket = ValetTicket.objects.select_related('slot').get(pk=pk)
        except ValetTicket.DoesNotExist:
            return Response({'error': 'Ticket not found.'}, status=status.HTTP_404_NOT_FOUND)
        if ticket.status != 'retrieved':
            return Response({'error': f'Cannot handover. Status: {ticket.status}'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            ticket.status = 'completed'
            ticket.exit_time = timezone.now()
            ticket.save()
            if ticket.slot:
                ticket.slot.is_occupied = False
                ticket.slot.save(update_fields=['is_occupied'])
            process_slot_queue()
        return Response(ValetTicketSerializer(ticket).data)


# ─── Ticket List / Detail ─────────────────────────────────────────────────────

class TicketListView(generics.ListAPIView):
    serializer_class = ValetTicketListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ValetTicket.objects.select_related('slot', 'assigned_valet', 'rfid_card')
        s = self.request.query_params
        if s.get('status'):    qs = qs.filter(status=s['status'])
        if s.get('zone'):      qs = qs.filter(slot__zone=s['zone'])
        if s.get('vehicle_type'): qs = qs.filter(vehicle_type=s['vehicle_type'])
        if s.get('is_vip'):    qs = qs.filter(is_vip=s['is_vip'].lower()=='true')
        if s.get('search'):
            q = s['search']
            qs = qs.filter(Q(ticket_id__icontains=q)|Q(customer_name__icontains=q)|Q(vehicle_number__icontains=q)|Q(phone__icontains=q))
        if s.get('date_from'): qs = qs.filter(entry_time__date__gte=s['date_from'])
        if s.get('date_to'):   qs = qs.filter(entry_time__date__lte=s['date_to'])
        return qs.order_by('-entry_time')


class TicketDetailView(generics.RetrieveAPIView):
    serializer_class = ValetTicketSerializer
    permission_classes = [IsAuthenticated]
    queryset = ValetTicket.objects.all()


class TicketReceiptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            ticket = ValetTicket.objects.select_related('rfid_card','slot','assigned_valet','created_by').get(pk=pk)
        except ValetTicket.DoesNotExist:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        rate = RateConfig.get_for_vehicle(ticket.vehicle_type)
        mins = ticket.duration_minutes
        h, m = divmod(mins, 60)
        duration_str = f"{h}h {m}m" if h else f"{m}m"
        valet_name = '—'
        if ticket.assigned_valet:
            valet_name = ticket.assigned_valet.get_full_name() or ticket.assigned_valet.username
        return Response({
            'receipt_no': ticket.ticket_id, 'ticket_id': ticket.ticket_id,
            'customer_name': ticket.customer_name, 'phone': ticket.phone,
            'vehicle_number': ticket.vehicle_number, 'vehicle_type': ticket.vehicle_type,
            'is_vip': ticket.is_vip, 'slot_category': ticket.slot_category,
            'slot_code': ticket.slot.slot_code if ticket.slot else '—',
            'zone': ticket.slot.zone if ticket.slot else '—',
            'entry_time': ticket.entry_time.isoformat(),
            'exit_time': ticket.exit_time.isoformat() if ticket.exit_time else None,
            'duration_str': duration_str, 'duration_minutes': mins,
            'rate_per_hour': str(rate.rate_per_hour),
            'grace_period_minutes': rate.grace_period_minutes,
            'minimum_charge': str(rate.minimum_charge),
            'fee_amount': str(ticket.fee_amount) if ticket.fee_amount is not None else '0.00',
            'payment_method': ticket.payment_method, 'payment_status': ticket.payment_status,
            'valet_name': valet_name,
            'generated_at': timezone.now().isoformat(), 'status': ticket.status,
        })


# ─── Valet Tasks ──────────────────────────────────────────────────────────────

class MyTasksView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        park = ValetTicket.objects.filter(assigned_valet=user, status='valet_assigned').select_related('slot','rfid_card')
        retrieve = RetrievalTask.objects.filter(assigned_valet=user, status='pending').select_related('ticket__slot','ticket__rfid_card')
        return Response({
            'park_tasks': ValetTicketListSerializer(park, many=True).data,
            'retrieval_tasks': [
                {
                    'retrieval_task_id': rt.id, 'ticket_id': rt.ticket.ticket_id,
                    'ticket_pk': rt.ticket.pk, 'vehicle_number': rt.ticket.vehicle_number,
                    'vehicle_type': rt.ticket.vehicle_type, 'customer_name': rt.ticket.customer_name,
                    'slot_code': rt.ticket.slot.slot_code if rt.ticket.slot else '—',
                    'zone': rt.ticket.slot.zone if rt.ticket.slot else '—',
                    'is_vip': rt.ticket.is_vip, 'slot_category': rt.ticket.slot_category,
                    'assigned_at': rt.assigned_at.isoformat(), 'status': rt.status,
                }
                for rt in retrieve
            ],
        })


class ConfirmParkedView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            ticket = ValetTicket.objects.select_related('slot').get(pk=pk)
        except ValetTicket.DoesNotExist:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if ticket.assigned_valet != request.user and request.user.role != 'admin':
            return Response({'error': 'Not your task.'}, status=status.HTTP_403_FORBIDDEN)
        if ticket.status != 'valet_assigned':
            return Response({'error': f'Cannot confirm. Status: {ticket.status}'}, status=status.HTTP_400_BAD_REQUEST)
        ticket.status = 'parked'
        ticket.parked_at = timezone.now()
        ticket.save(update_fields=['status','parked_at'])
        return Response(ValetTicketListSerializer(ticket).data)


class ConfirmRetrievedView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            rt = RetrievalTask.objects.select_related('ticket').get(pk=pk)
        except RetrievalTask.DoesNotExist:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        if rt.assigned_valet != request.user and request.user.role != 'admin':
            return Response({'error': 'Not your task.'}, status=status.HTTP_403_FORBIDDEN)
        if rt.status != 'pending':
            return Response({'error': f'Already {rt.status}.'}, status=status.HTTP_400_BAD_REQUEST)
        rt.status = 'retrieved'
        rt.confirmed_at = timezone.now()
        rt.save()
        rt.ticket.status = 'retrieved'
        rt.ticket.save(update_fields=['status'])
        return Response({'status':'retrieved','ticket_id':rt.ticket.ticket_id})


# ─── Rate Config ──────────────────────────────────────────────────────────────

class RateConfigListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        vts = ['car','suv','bike','truck','other']
        return Response([RateConfigSerializer(RateConfig.get_for_vehicle(vt)).data for vt in vts])

    def post(self, request):
        if request.user.role != 'admin':
            raise PermissionDenied("Admin only.")
        items = request.data if isinstance(request.data, list) else [request.data]
        updated, errors = [], []
        for item in items:
            vt = item.get('vehicle_type')
            if not vt:
                continue
            try:
                rate = RateConfig.objects.get(vehicle_type=vt)
                ser = RateConfigSerializer(rate, data=item, partial=True)
            except RateConfig.DoesNotExist:
                ser = RateConfigSerializer(data=item)
            if ser.is_valid():
                ser.save()
                updated.append(ser.data)
            else:
                errors.append(ser.errors)
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(updated)


# ─── Exception Log ────────────────────────────────────────────────────────────

class ExceptionLogListView(generics.ListAPIView):
    serializer_class = ExceptionLogSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get_queryset(self):
        qs = ExceptionLog.objects.select_related('ticket','resolved_by')
        t = self.request.query_params.get('type')
        if t:
            qs = qs.filter(type=t)
        return qs


# ─── Legacy Lost Token / OTP (kept for backward compat) ───────────────────────

class LostTokenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = LostTokenSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        search_type = ser.validated_data['search_type']
        search_value = ser.validated_data['search_value'].strip()
        if search_type == 'phone':
            cards = RFIDCard.objects.filter(phone__icontains=search_value)
        else:
            cards = RFIDCard.objects.filter(vehicle_number__icontains=search_value.upper())
        if not cards.exists():
            return Response({'found': False, 'cards': []})
        results = []
        for card in cards:
            otp = str(random.randint(100000, 999999))
            _otp_store[card.uid] = {'otp': otp, 'expires': timezone.now().timestamp() + 300}
            results.append({**RFIDCardSerializer(card).data, 'otp': otp})
        ExceptionLog.objects.create(type='lost_rfid', rfid_uid=cards.first().uid, resolved_by=request.user, notes=f"Lost token: {search_type}={search_value}")
        return Response({'found': True, 'cards': results})


class OTPVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = OTPVerifySerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
        uid = ser.validated_data['rfid_uid'].strip()
        otp = ser.validated_data['otp'].strip()
        stored = _otp_store.get(uid)
        if not stored:
            return Response({'error': 'OTP not found or expired.'}, status=status.HTTP_400_BAD_REQUEST)
        if timezone.now().timestamp() > stored['expires']:
            del _otp_store[uid]
            return Response({'error': 'OTP expired.'}, status=status.HTTP_400_BAD_REQUEST)
        if stored['otp'] != otp:
            return Response({'error': 'Invalid OTP.'}, status=status.HTTP_400_BAD_REQUEST)
        del _otp_store[uid]
        try:
            card = RFIDCard.objects.get(uid=uid)
        except RFIDCard.DoesNotExist:
            return Response({'error': 'Card not found.'}, status=status.HTTP_404_NOT_FOUND)
        ExceptionLog.objects.create(type='otp_verified', rfid_uid=uid, resolved_by=request.user, notes="Legacy OTP verified")
        return Response({'verified': True, 'card': RFIDCardSerializer(card).data})


# ─── Enhancement 3 — New OTP endpoints ───────────────────────────────────────

class OTPSendView(APIView):
    """POST /api/otp/send/ — search customer and send OTP."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = OTPSendSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        phone = ser.validated_data.get('phone', '').strip()
        vehicle_number = ser.validated_data.get('vehicle_number', '').strip().upper()
        purpose = ser.validated_data.get('purpose', 'lost_token_entry')

        # Search for card
        if phone:
            cards = RFIDCard.objects.filter(phone__icontains=phone, is_active=True)
        else:
            cards = RFIDCard.objects.filter(vehicle_number__icontains=vehicle_number, is_active=True)

        if not cards.exists():
            ExceptionLog.objects.create(
                type='lost_token_entry' if purpose == 'lost_token_entry' else 'lost_token_exit',
                rfid_uid='unknown', resolved_by=request.user,
                notes=f"Lost token search failed: phone={phone}, vehicle={vehicle_number}"
            )
            return Response({'error': 'No registered customer found matching that phone or vehicle number.'}, status=status.HTTP_404_NOT_FOUND)

        card = cards.first()
        contact_phone = card.phone
        if not contact_phone:
            return Response({'error': 'No phone number on file for this customer.'}, status=status.HTTP_400_BAD_REQUEST)

        # Invalidate old unused OTPs for this phone
        OTPVerification.objects.filter(phone=contact_phone, is_used=False, purpose=purpose).update(is_used=True)

        # Generate new OTP
        otp_code = generate_otp()
        expires_at = timezone.now() + timezone.timedelta(minutes=10)
        otp_record = OTPVerification.objects.create(
            phone=contact_phone,
            otp_code=otp_code,
            purpose=purpose,
            expires_at=expires_at,
        )

        # Send SMS (logs in dev mode)
        send_sms(contact_phone, otp_code)

        ExceptionLog.objects.create(
            type='lost_token_entry' if purpose == 'lost_token_entry' else 'lost_token_exit',
            rfid_uid=card.uid, resolved_by=request.user,
            notes=f"OTP sent to {contact_phone[:2]}****{contact_phone[-4:]}"
        )

        # Mask phone: show first 2 + last 4 digits
        masked = f"{contact_phone[:2]}{'*' * (len(contact_phone)-6)}{contact_phone[-4:]}" if len(contact_phone) >= 6 else '****'

        response_data = {
            'success': True,
            'phone_masked': masked,
            # Raw phone returned so the frontend can use it for OTP verification.
            # This is safe: the operator is authenticated staff; the customer already
            # verified ownership via the search step.
            'phone': contact_phone,
            'customer_name': card.customer_name,
            'vehicle_number': card.vehicle_number,
            'vehicle_type': card.vehicle_type,
            'is_vip': card.is_vip,
            'otp_expires_in_seconds': 600,
        }

        # In dev mode, include OTP preview so frontend can show it
        if getattr(django_settings, 'DEBUG', False):
            response_data['otp_preview'] = otp_code

        return Response(response_data)


class OTPVerifyNewView(APIView):
    """POST /api/otp/verify/ — verify OTP and return card."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = OTPVerifyNewSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        phone = ser.validated_data['phone'].strip()
        otp_code = ser.validated_data['otp_code'].strip()
        purpose = ser.validated_data['purpose']

        # Find latest unused, unexpired OTP for this phone
        otp_record = OTPVerification.objects.filter(
            phone__icontains=phone, purpose=purpose, is_used=False
        ).order_by('-created_at').first()

        if not otp_record:
            return Response({'error': 'No active OTP found. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

        if otp_record.is_expired:
            return Response({'error': 'OTP expired — request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

        if otp_record.attempts >= 3:
            return Response({'error': 'Too many attempts — request a new OTP.', 'locked': True}, status=status.HTTP_403_FORBIDDEN)

        if otp_record.otp_code != otp_code:
            otp_record.attempts += 1
            otp_record.save(update_fields=['attempts'])
            remaining = 3 - otp_record.attempts
            return Response({
                'error': f'Invalid OTP. {remaining} attempt{"s" if remaining!=1 else ""} remaining.',
                'attempts_remaining': remaining,
            }, status=status.HTTP_400_BAD_REQUEST)

        # Success
        otp_record.is_used = True
        otp_record.verified_at = timezone.now()
        otp_record.save(update_fields=['is_used', 'verified_at'])

        # Lookup card
        try:
            card = RFIDCard.objects.get(phone__icontains=phone, is_active=True)
        except RFIDCard.DoesNotExist:
            return Response({'error': 'Card not found after OTP verification.'}, status=status.HTTP_404_NOT_FOUND)
        except RFIDCard.MultipleObjectsReturned:
            # Multiple active cards share this phone — pick the most recent and log it
            card = RFIDCard.objects.filter(phone__icontains=phone, is_active=True).order_by('-created_at').first()
            ExceptionLog.objects.create(
                type='manual_override',
                rfid_uid=card.uid if card else 'unknown',
                resolved_by=request.user,
                notes=f"Multiple active cards found for phone {phone[:2]}****{phone[-4:]} — picked most recent (uid={card.uid if card else '?'})"
            )
            if not card:
                return Response({'error': 'Card not found after OTP verification.'}, status=status.HTTP_404_NOT_FOUND)

        ExceptionLog.objects.create(
            type='otp_verified', rfid_uid=card.uid,
            resolved_by=request.user,
            notes=f"OTP verified for {purpose}: {phone[:2]}****{phone[-4:]}"
        )

        return Response({
            'verified': True,
            'card': RFIDCardSerializer(card).data,
        })


class CustomerLookupView(APIView):
    """GET /api/otp/customer-lookup/?phone=...  — partial search, masked results."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        phone = request.query_params.get('phone', '').strip()
        vehicle_number = request.query_params.get('vehicle_number', '').strip().upper()

        if not phone and not vehicle_number:
            return Response({'error': 'Provide phone or vehicle_number.'}, status=status.HTTP_400_BAD_REQUEST)

        if phone:
            cards = RFIDCard.objects.filter(phone__icontains=phone, is_active=True)
        else:
            cards = RFIDCard.objects.filter(vehicle_number__icontains=vehicle_number, is_active=True)

        results = []
        for card in cards[:5]:
            p = card.phone
            masked = f"{p[:2]}{'*' * (len(p)-6)}{p[-4:]}" if len(p) >= 6 else '****'
            results.append({
                'customer_name': card.customer_name,
                'phone_masked': masked,
                'vehicle_number': card.vehicle_number,
                'vehicle_type': card.vehicle_type,
                'is_vip': card.is_vip,
                # Do NOT return uid or full phone (security)
            })

        return Response({'found': bool(results), 'results': results})


# ─── Dashboard Stats ──────────────────────────────────────────────────────────

class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from accounts.models import User
        today = localdate()
        total_slots = ParkingSlot.objects.count()
        occupied = ParkingSlot.objects.filter(is_occupied=True).count()
        available = total_slots - occupied
        active_statuses = ['checked_in','queued_slot','queued_valet','valet_assigned','parked','retrieval_pending','retrieved']
        tickets_today = ValetTicket.objects.filter(entry_time__date=today)
        today_entries = tickets_today.count()
        today_exits = ValetTicket.objects.filter(exit_time__date=today, status='completed').count()
        today_revenue = ValetTicket.objects.filter(exit_time__date=today, status='completed').aggregate(t=Sum('fee_amount'))['t'] or Decimal('0')
        active_tickets = ValetTicket.objects.filter(status__in=active_statuses).count()
        parked_tickets = ValetTicket.objects.filter(status='parked').count()
        slot_queue_count = SlotQueue.objects.filter(status='waiting').count()
        valet_queue_count = ValetQueue.objects.filter(status='waiting').count()
        exception_count = ExceptionLog.objects.filter(timestamp__date=today).count()
        vip_active = ValetTicket.objects.filter(status__in=active_statuses, is_vip=True).count()

        on_shift = User.objects.filter(role='attendant', is_on_shift=True).annotate(
            active_tasks=Count('assigned_tickets', filter=Q(assigned_tickets__status__in=['valet_assigned','parked','retrieval_pending'])),
            today_tasks=Count('assigned_tickets', filter=Q(assigned_tickets__entry_time__date=today))
        ).order_by('-active_tasks')

        zones = ParkingSlot.objects.values('zone').annotate(
            total=Count('id'), occupied_count=Count('id', filter=Q(is_occupied=True))
        ).order_by('zone')
        tickets_by_status = ValetTicket.objects.filter(status__in=active_statuses).values('status').annotate(count=Count('id'))

        return Response({
            'total_slots': total_slots, 'occupied': occupied, 'available': available,
            'today_entries': today_entries, 'today_exits': today_exits,
            'today_revenue': str(today_revenue),
            'active_tickets': active_tickets, 'parked_tickets': parked_tickets,
            'slot_queue_count': slot_queue_count, 'valet_queue_count': valet_queue_count,
            'exception_count_today': exception_count,
            'on_shift_count': on_shift.count(),
            'vip_active': vip_active,
            'attendant_workload': [{'id':a.id,'full_name':a.get_full_name() or a.username,'is_on_shift':a.is_on_shift,'active_tasks':a.active_tasks,'today_tasks':a.today_tasks} for a in on_shift],
            'zones': list(zones), 'tickets_by_status': list(tickets_by_status),
        })


# ─── Valet History ────────────────────────────────────────────────────────────

class ValetHistoryView(generics.ListAPIView):
    serializer_class = ValetTicketListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        today = localdate()
        return ValetTicket.objects.filter(assigned_valet=self.request.user, status='completed', exit_time__date=today).order_by('-exit_time')


# ─── Export ───────────────────────────────────────────────────────────────────

class TicketExportView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        fmt = request.query_params.get('format', 'csv')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        ticket_status = request.query_params.get('status', 'completed')

        qs = ValetTicket.objects.select_related('slot','assigned_valet','rfid_card').order_by('-entry_time')
        if ticket_status: qs = qs.filter(status=ticket_status)
        if date_from: qs = qs.filter(entry_time__date__gte=date_from)
        if date_to: qs = qs.filter(entry_time__date__lte=date_to)

        HEADERS = ['Ticket ID','Customer','Vehicle No','Type','VIP','Slot','Zone','Category','Entry Time','Exit Time','Duration (min)','Fee (INR)','Payment','Valet','Status']

        def row(t):
            return [
                t.ticket_id, t.customer_name, t.vehicle_number, t.vehicle_type,
                'Yes' if t.is_vip else 'No',
                t.slot.slot_code if t.slot else '', t.slot.zone if t.slot else '',
                t.slot_category,
                t.entry_time.strftime('%Y-%m-%d %H:%M') if t.entry_time else '',
                t.exit_time.strftime('%Y-%m-%d %H:%M') if t.exit_time else '',
                t.duration_minutes,
                str(t.fee_amount) if t.fee_amount else '0.00',
                t.payment_method or '',
                (t.assigned_valet.get_full_name() or t.assigned_valet.username) if t.assigned_valet else '',
                t.status,
            ]

        if fmt == 'xlsx':
            try:
                import openpyxl
                from openpyxl.styles import Font, PatternFill, Alignment
            except ImportError:
                return Response({'error': 'openpyxl not installed.'}, status=400)
            wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Valet Tickets'
            hf = Font(bold=True, color='FFFFFF')
            hfill = PatternFill(fill_type='solid', fgColor='1A1D26')
            for ci, h in enumerate(HEADERS, 1):
                cell = ws.cell(row=1, column=ci, value=h)
                cell.font = hf; cell.fill = hfill; cell.alignment = Alignment(horizontal='center')
                ws.column_dimensions[cell.column_letter].width = max(len(h)+4, 14)
            for ri, t in enumerate(qs, 2):
                for ci, val in enumerate(row(t), 1):
                    ws.cell(row=ri, column=ci, value=val)
            buf = io.BytesIO(); wb.save(buf); buf.seek(0)
            resp = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            resp['Content-Disposition'] = 'attachment; filename="valet_tickets.xlsx"'
            return resp

        def stream_csv():
            buf = io.StringIO(); writer = csv.writer(buf)
            writer.writerow(HEADERS); yield buf.getvalue(); buf.seek(0); buf.truncate()
            for t in qs:
                writer.writerow(row(t)); yield buf.getvalue(); buf.seek(0); buf.truncate()

        resp = StreamingHttpResponse(stream_csv(), content_type='text/csv')
        resp['Content-Disposition'] = 'attachment; filename="valet_tickets.csv"'
        return resp
