import { randomUUID } from 'crypto';

import { TicketTypeRepository, UserRepository, OrderRepository, OrderItemRepository, EventRepository, TicketPurchaseRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { publishAdminEvent } from './admin-events.service';

import type { RedeemTicketInput, ReserveTicketsInput } from '../schemas/ticket.schema';

/**
 * Generate a unique ticket code in format PF-XXXXXXXX
 */
function generateTicketCode(): string {
  return `PF-${randomUUID().substring(0, 8).toUpperCase()}`;
}

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
  let customerId: number | undefined;

  // If customerId is directly provided (from guest checkout with real customer record), use it
  if (input.customerId) {
    customerId = input.customerId;
  } else if (input.guardianId.startsWith('guest_') || input.guardianId.startsWith('customer_')) {
    // Legacy guest checkout format or new customer_ format
    // For customer_ format, extract the ID
    if (input.guardianId.startsWith('customer_')) {
      const extractedId = parseInt(input.guardianId.replace('customer_', ''), 10);
      if (!isNaN(extractedId)) {
        customerId = extractedId;
      }
    }
    // For legacy guest_ format, customerId stays undefined (backwards compatibility)
  } else {
    // Regular authenticated user checkout
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

  // Decrement tickets_remaining for event tickets
  if (input.type === 'event' && input.eventId) {
    const eventId = parseInt(input.eventId, 10);
    if (!isNaN(eventId)) {
      try {
        await EventRepository.decrementTickets(eventId, input.quantity);
      } catch (err) {
        console.error('Failed to decrement event tickets:', err);
        // Don't fail the order if decrement fails - the order is already created
      }
    }
  }

  // Generate unique codes for each ticket
  const codes: Array<{ code: string; status: string }> = [];
  for (let i = 0; i < input.quantity; i++) {
    codes.push({
      code: generateTicketCode(),
      status: 'unused',
    });
  }

  // Create ticket_purchase record with codes for redemption tracking
  let ticketPurchase = null;
  if (customerId) {
    try {
      ticketPurchase = await TicketPurchaseRepository.create({
        customer_id: customerId,
        ticket_type_id: ticketTypeId && !isNaN(ticketTypeId) ? ticketTypeId : undefined,
        event_id: input.type === 'event' && input.eventId ? parseInt(input.eventId, 10) : undefined,
        ticket_type: input.type || 'general',
        quantity: input.quantity,
        unit_price: input.price,
        total,
        codes,
        status: 'confirmed',
        metadata: input.metadata,
      });
    } catch (err) {
      console.error('Failed to create ticket_purchase record:', err);
      // Continue - order is already created, codes can still be used
    }
  }

  publishAdminEvent('ticket.reserved', {
    orderId: order.order_id,
    purchaseId: ticketPurchase?.purchase_id,
    guardianId: input.guardianId,
    quantity: input.quantity,
    total,
    codes,
  });

  return {
    id: String(order.order_id),
    purchaseId: ticketPurchase?.purchase_id,
    type: input.type,
    quantity: input.quantity,
    price: input.price,
    total,
    status: order.status,
    createdAt: order.created_at,
    codes,
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

/**
 * Lookup a ticket by its code
 * Returns ticket info including customer details and redemption status
 */
export async function lookupTicketByCode(code: string) {
  const normalizedCode = code.trim().toUpperCase();

  // Find ticket purchase containing this code
  const purchase = await TicketPurchaseRepository.findByCode(normalizedCode);

  if (!purchase) {
    throw new AppError('Ticket code not found', 404);
  }

  // Find the specific code in the codes array
  const codes = purchase.codes as Array<{ code: string; status: string; redeemedAt?: string }>;
  const codeEntry = codes.find(c => c.code === normalizedCode);

  if (!codeEntry) {
    throw new AppError('Ticket code not found in purchase', 404);
  }

  return {
    purchaseId: purchase.purchase_id,
    code: codeEntry.code,
    status: codeEntry.status,
    redeemedAt: codeEntry.redeemedAt || null,
    ticketType: purchase.ticket_type,
    quantity: purchase.quantity,
    eventId: purchase.event_id,
    customerId: purchase.customer_id,
    customer: purchase.customers || null,
    createdAt: purchase.created_at,
  };
}

/**
 * Validate a ticket code (check if it's valid and unused)
 */
export async function validateTicketCode(code: string) {
  try {
    const ticket = await lookupTicketByCode(code);
    return {
      valid: ticket.status === 'unused',
      status: ticket.status,
      message: ticket.status === 'unused'
        ? 'Ticket is valid and ready to be redeemed'
        : ticket.status === 'redeemed'
          ? `Ticket was already redeemed on ${ticket.redeemedAt}`
          : `Ticket status: ${ticket.status}`,
      ticket,
    };
  } catch (err) {
    return {
      valid: false,
      status: 'invalid',
      message: err instanceof AppError ? err.message : 'Invalid ticket code',
      ticket: null,
    };
  }
}

/**
 * Redeem a ticket code
 */
export async function redeemTicketByCode(code: string, redeemedBy?: string) {
  const normalizedCode = code.trim().toUpperCase();

  // Find ticket purchase containing this code
  const purchase = await TicketPurchaseRepository.findByCode(normalizedCode);

  if (!purchase) {
    throw new AppError('Ticket code not found', 404);
  }

  // Find and update the specific code
  const codes = purchase.codes as Array<{ code: string; status: string; redeemedAt?: string; redeemedBy?: string }>;
  const codeEntry = codes.find(c => c.code === normalizedCode);

  if (!codeEntry) {
    throw new AppError('Ticket code not found in purchase', 404);
  }

  if (codeEntry.status === 'redeemed') {
    throw new AppError(`Ticket was already redeemed on ${codeEntry.redeemedAt}`, 400);
  }

  // Use the repository's redeemCode method
  const updatedPurchase = await TicketPurchaseRepository.redeemCode(purchase.purchase_id, normalizedCode);

  publishAdminEvent('ticket.redeemed', {
    purchaseId: purchase.purchase_id,
    code: normalizedCode,
    redeemedBy,
  });

  return {
    success: true,
    purchaseId: purchase.purchase_id,
    code: normalizedCode,
    redeemedAt: new Date().toISOString(),
    redeemedBy,
    ticketType: purchase.ticket_type,
    customer: purchase.customers || null,
  };
}

export async function redeemTicket(input: RedeemTicketInput) {
  // Check if input.code is a ticket code (starts with PF-) or an order ID
  if (input.code.toUpperCase().startsWith('PF-')) {
    return redeemTicketByCode(input.code);
  }

  // Legacy: treat as order ID
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
