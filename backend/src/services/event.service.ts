import { EventRepository } from '../repositories';
import { supabaseAny } from '../config/supabase';
import { AppError } from '../utils/app-error';

import type { EventFilterInput } from '../schemas/event.schema';

export async function listEvents(filter: EventFilterInput) {
  let query = supabaseAny.from('events').select('*').eq('is_published', true);

  if (filter.from) {
    query = query.gte('start_date', filter.from.toISOString());
  }
  if (filter.to) {
    query = query.lte('start_date', filter.to.toISOString());
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
