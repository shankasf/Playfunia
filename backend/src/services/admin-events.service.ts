import { EventEmitter } from 'node:events';

export type AdminEvent = {
  type: string;
  payload?: unknown;
  timestamp: string;
};

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

const RECENT_QUEUE_LIMIT = 100;
const recentEvents: AdminEvent[] = [];

export function publishAdminEvent(type: string, payload?: unknown) {
  const event: AdminEvent = {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };

  recentEvents.push(event);
  if (recentEvents.length > RECENT_QUEUE_LIMIT) {
    recentEvents.shift();
  }

  emitter.emit('event', event);
}

export function subscribeAdminEvents(listener: (event: AdminEvent) => void) {
  emitter.on('event', listener);
  return () => {
    emitter.off('event', listener);
  };
}

export function getRecentAdminEvents() {
  return [...recentEvents];
}
