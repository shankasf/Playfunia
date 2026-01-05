import { DateTime } from 'luxon';

import { EventRepository, TicketPurchaseRepository } from '../repositories';
import { supabaseAny } from '../config/supabase';
import { AppError } from '../utils/app-error';

import type { EventFilterInput, RsvpEventInput } from '../schemas/event.schema';

export async function listEvents(filter: EventFilterInput) {
  // Build Supabase query for published events
  let query = supabaseAny.from('events').select('*, locations(*)').eq('is_published', true);

  if (filter.from) {
    query = query.gte('start_date', filter.from.toISOString());
  }
  if (filter.to) {
    query = query.lte('start_date', filter.to.toISOString());
  }
  if (filter.tag) {
    query = query.contains('tags', [filter.tag]);
  }

  const { data, error } = await query.order('start_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getEventById(eventId: string) {
  const id = parseInt(eventId, 10);
  if (isNaN(id)) {
    throw new AppError('Invalid event ID', 400);
  }
  
  const event = await EventRepository.findById(id);
  if (!event) {
    throw new AppError('Event not found', 404);
  }
  return event;
}

export async function rsvpToEvent(customerId: string, eventId: string, input: RsvpEventInput) {
  const id = parseInt(eventId, 10);
  const custId = parseInt(customerId, 10);
  
  if (isNaN(id) || isNaN(custId)) {
    throw new AppError('Invalid ID', 400);
  }

  const event = await EventRepository.findById(id);
  if (!event || !event.is_published) {
    throw new AppError('Event not available', 404);
  }

  // Check if event has ended (use start_date as fallback if end_date is null)
  const eventEndDate = event.end_date ?? event.start_date;
  if (eventEndDate && DateTime.fromISO(eventEndDate) < DateTime.now()) {
    throw new AppError('Event has already ended', 400);
  }

  // Check for existing reservation
  const { data: existingPurchases } = await supabaseAny
    .from('ticket_purchases')
    .select('*')
    .eq('customer_id', custId)
    .eq('event_id', id)
    .neq('status', 'Cancelled');

  const existingPurchase = existingPurchases?.[0];
  const existingQuantity = existingPurchase ? existingPurchase.quantity : 0;
  const delta = input.quantity - existingQuantity;

  if (delta > 0 && delta > (event.tickets_remaining ?? 0)) {
    throw new AppError('Not enough tickets remaining for this event', 400);
  }

  // Update event tickets remaining
  await EventRepository.update(id, {
    tickets_remaining: Math.max(0, (event.tickets_remaining ?? 0) - delta),
  });

  if (existingPurchase) {
    // Update existing purchase
    const updated = await TicketPurchaseRepository.update(existingPurchase.purchase_id, {
      quantity: input.quantity,
      status: 'reserved',
    });
    return updated;
  }

  // Create new reservation
  const purchase = await TicketPurchaseRepository.create({
    customer_id: custId,
    event_id: id,
    quantity: input.quantity,
    unit_price: event.price ?? 0,
    total: (event.price ?? 0) * input.quantity,
    codes: [],
    status: 'reserved',
  });

  return purchase;
}
