import { z } from 'zod';
import { CITIES } from '../cities/cities.data';

const isValidCity = (val: string) => CITIES.some((c) => c.id === val);

export const createTripSchema = z.object({
  body: z.object({
    pickupCity: z.string().refine(isValidCity, { message: 'Invalid pickup city' }),
    destinationCity: z.string().refine(isValidCity, { message: 'Invalid destination city' }),
    requestedAt: z.string().refine((val) => {
      const requestedDate = new Date(val);
      if (isNaN(requestedDate.getTime())) return false;
      const hoursFromNow = (requestedDate.getTime() - Date.now()) / (1000 * 60 * 60);
      return hoursFromNow >= 2;
    }, { message: 'Pickup time must be at least 2 hours in the future' }),
    passengerCount: z.number().int().min(1).max(10),
    luggageSmall: z.number().int().min(0).max(20).default(0),
    luggageMedium: z.number().int().min(0).max(10).default(0),
    luggageLarge: z.number().int().min(0).max(10).default(0),
    luggageBackpack: z.number().int().min(0).max(10).default(0),
    luggageLaptop: z.number().int().min(0).max(10).default(0),
    extraPreferences: z.string().max(500).optional(),
    riderName: z.string().min(2).max(100),
    riderPhone: z.string().regex(/^\+201[0125]\d{8}$/, { message: 'Invalid Egyptian phone number' }),
  }).refine(data => data.pickupCity !== data.destinationCity, {
    message: 'Pickup and destination cities cannot be the same',
    path: ['destinationCity'],
  }),
});

export const getTripSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export const confirmTripSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    confirmationToken: z.string().uuid(),
  }),
});

export const cancelTripSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    confirmationToken: z.string().uuid(),
    reason: z.string().min(5),
  }),
});
