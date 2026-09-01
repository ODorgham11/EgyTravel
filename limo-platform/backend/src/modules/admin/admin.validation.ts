import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    phone: z.string().min(5),
    password: z.string().min(6),
  }),
});

export const assignTripSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    carId: z.string().uuid(),
    driverId: z.string().uuid(),
    price: z.number().positive(),
    exactPickupTime: z.string().refine((val) => {
      const d = new Date(val);
      return !isNaN(d.getTime()) && d.getTime() > Date.now();
    }, { message: 'Pickup time must be in the future' }),
    paymentMethod: z.enum(['ONLINE', 'OFFLINE']),
  }),
});

export const cancelTripAdminSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    reason: z.string().min(5),
  }),
});

export const completeTripAdminSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const createCarSchema = z.object({
  body: z.object({
    model: z.string().min(2),
    color: z.string().min(2),
    plateNumber: z.string().min(2),
    capacity: z.number().int().min(1),
    owned: z.boolean().default(true),
  }),
});

export const createDriverSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    phone: z.string().min(5),
    isExternal: z.boolean().default(false),
  }),
});
