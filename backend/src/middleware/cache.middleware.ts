import type { RequestHandler } from 'express';

/**
 * Middleware to set Cache-Control headers for public content.
 * @param maxAge - Max age in seconds (default: 5 minutes)
 */
export function cachePublic(maxAge = 300): RequestHandler {
  return (_req, res, next) => {
    res.set('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`);
    next();
  };
}

/**
 * Middleware to prevent caching for private/dynamic content.
 */
export function noCache(): RequestHandler {
  return (_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
  };
}
