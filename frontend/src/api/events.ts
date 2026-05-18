import { apiGet } from './client';
import type { EventItem, EventPhoto } from '../data/types';

export async function fetchEvent(eventId: string): Promise<EventItem> {
  return apiGet<EventItem>(`/events/${eventId}`);
}


export async function fetchEventPhotos(eventId: string | number) {
  const response = await apiGet<{ photos: EventPhoto[] }>(`/events/${eventId}/photos`);
  return response.photos;
}
