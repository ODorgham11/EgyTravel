import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// For the demo prototype, we use an in-memory rate limiter instead of Redis.
// In production (Phase 10), this should be swapped for RateLimiterRedis.

const limiters: Record<string, RateLimiterMemory> = {
  trips: new RateLimiterMemory({
    points: 5,
    duration: 60,
  }),
  confirm: new RateLimiterMemory({
    points: 10,
    duration: 60,
  }),
  cancel: new RateLimiterMemory({
    points: 10,
    duration: 60,
  }),
  adminLogin: new RateLimiterMemory({
    points: 10,
    duration: 60,
  }),
};

export const rateLimiter = (type: 'trips' | 'confirm' | 'cancel' | 'adminLogin') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // In mock mode, we can optionally bypass rate limits entirely, 
    // but applying them in memory verifies the middleware works.
    const limiter = limiters[type];
    if (!limiter) {
       next();
       return;
    }

    try {
      await limiter.consume(req.ip ?? 'unknown');
      next();
    } catch (rejRes) {
      res.status(429).json({ error: 'Too many requests, please try again later' });
    }
  };
};
