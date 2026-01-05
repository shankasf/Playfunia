import { randomUUID } from 'crypto';

import { TicketTypeRepository, UserRepository, OrderRepository, OrderItemRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { publishAdminEvent } from './admin-events.service';

import type { RedeemTicketInput, ReserveTicketsInput } from '../schemas/ticket.schema';

export async function listTicketTypes() {
  const ticketTypes = await TicketTypeRepository.findAll(true);
  return ticketTypes.map(t => ({
    id: String(t.ticket_type_id),
    name: t.name,
    description: t.description,
    basePrice: t.base_price_usd,
    requiresWaiver: t.requires_waiver,
    requiresGripSocks: t.requires_grip_socks,
    locationId: t.location_id,
    isActive: t.is_active,
  }));
}

export async function reserveTickets(input: ReserveTicketsInput) {
  // Handle guest checkouts - guardianId may be "guest_email@example.com"
  const isGuestCheckout = input.guardianId.startsWith('guest_');

  let customerId: number | undefined;

  if (isGuestCheckout) {
    // Guest checkout - no customer account, tickets are tracked by metadata
    customerId = undefined;
  } else {
    const guardianId = parseInt(input.guardianId, 10);
    if (isNaN(guardianId)) {
      throw new AppError('Invalid guardian ID', 400);
    }

    const guardian = await UserRepository.findById(guardianId);
    if (!guardian?.customer_id) {
      throw new AppError('Guardian not found', 404);
    }
    customerId = guardian.customer_id;
  }

  const total = input.price * input.quantity;

  // Create an order for the tickets
  const order = await OrderRepository.create({
    customer_id: customerId,
    order_type: 'Admission',
    status: 'Pending',
    subtotal_usd: total,
    total_usd: total,
  });

  // Create order item for the ticket
  const ticketTypeId = input.type === 'event' && input.eventId 
    ? parseInt(input.eventId, 10) 
    : undefined;

  await OrderItemRepository.create({
    order_id: order.order_id,
    item_type: 'Ticket',
    ticket_type_id: ticketTypeId && !isNaN(ticketTypeId) ? ticketTypeId : undefined,
    name_override: input.type,
    quantity: input.quantity,
    unit_price_usd: input.price,
    line_total_usd: total,
  });

  publishAdminEvent('ticket.reserved', {
    orderId: order.order_id,
    guardianId: input.guardianId,
    quantity: input.quantity,
    total,
  });

  return {
    id: String(order.order_id),
    type: input.type,
    quantity: input.quantity,
    price: input.price,
    total,
    status: order.status,
    createdAt: order.created_at,
  };
}

export async function listTicketsForGuardian(guardianId: string) {
  const userId = parseInt(guardianId, 10);
  if (isNaN(userId)) return [];

  const user = await UserRepository.findById(userId);
  if (!user?.customer_id) return [];

  const orders = await OrderRepository.findByCustomerId(user.customer_id);
  
  // Filter to admission orders only
  return orders
    .filter(o => o.order_type === 'Admission')
    .map(o => ({
      id: String(o.order_id),
      type: 'admission',
      quantity: (o.order_items as Array<{ quantity: number }>)?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
      total: o.total_usd,
      status: o.status,
      createdAt: o.created_at,
    }));
}

export async function listAllTickets() {
  const orders = await OrderRepository.findAll({ orderType: 'Admission' });
  
  return orders.map(o => ({
    id: String(o.order_id),
    customer: (o as { customers?: { full_name?: string; email?: string } }).customers,
    type: 'admission',
    quantity: (o.order_items as Array<{ quantity: number }>)?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    total: o.total_usd,
    status: o.status,
    createdAt: o.created_at,
  }));
}

export async function redeemTicket(input: RedeemTicketInput) {
  // For now, update order status to Fulfilled
  // In production, this would check against a codes table or admissions
  const orderId = parseInt(input.code, 10);
  if (isNaN(orderId)) {
    throw new AppError('Invalid ticket code', 400);
  }

  const order = await OrderRepository.findById(orderId);
  if (!order) {
    throw new AppError('Ticket not found', 404);
  }

  if (order.status === 'Fulfilled') {
    throw new AppError('Ticket already redeemed', 400);
  }

  await OrderRepository.update(orderId, { status: 'Fulfilled' });

  publishAdminEvent('ticket.redeemed', { orderId: order.order_id });

  return {
    id: String(order.order_id),
    status: 'Fulfilled',
    redeemedAt: new Date().toISOString(),
  };
}
