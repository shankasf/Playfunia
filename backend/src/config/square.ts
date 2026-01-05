import { SquareClient, SquareEnvironment } from 'square';

import { appConfig } from './env';

let squareClient: SquareClient | null = null;

export function getSquareClient(): SquareClient {
  if (squareClient) {
    return squareClient;
  }

  if (!appConfig.squareAccessToken) {
    throw new Error('Square access token is not configured.');
  }

  squareClient = new SquareClient({
    token: appConfig.squareAccessToken,
    environment: appConfig.squareEnvironment === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
  });

  return squareClient;
}

export function getSquareLocationId(): string {
  if (!appConfig.squareLocationId) {
    throw new Error('Square location ID is not configured.');
  }
  return appConfig.squareLocationId;
}
