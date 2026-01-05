import Stripe from 'stripe';

import { appConfig } from './env';

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (stripeClient) {
    return stripeClient;
  }

  if (!appConfig.stripeSecretKey) {
    throw new Error('Stripe secret key is not configured.');
  }

  stripeClient = new Stripe(appConfig.stripeSecretKey);

  return stripeClient;
}
