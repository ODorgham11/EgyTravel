import { Router } from 'express';
import { TripsController } from './trips.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { rateLimiter } from '../../middleware/rateLimiter';
import {
  createTripSchema,
  getTripSchema,
  confirmTripSchema,
  cancelTripSchema,
} from './trips.validation';

export const tripsRouter = Router();
const tripsController = new TripsController();

tripsRouter.post(
  '/',
  rateLimiter('trips'),
  validateRequest(createTripSchema),
  tripsController.createTrip
);

tripsRouter.get(
  '/:id',
  validateRequest(getTripSchema),
  tripsController.getTrip
);

tripsRouter.post(
  '/:id/confirm',
  rateLimiter('confirm'),
  validateRequest(confirmTripSchema),
  tripsController.confirmTrip
);

tripsRouter.post(
  '/:id/cancel',
  rateLimiter('cancel'),
  validateRequest(cancelTripSchema),
  tripsController.cancelTrip
);
