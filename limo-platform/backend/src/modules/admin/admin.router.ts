import { Router } from 'express';
import { AdminController } from './admin.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { rateLimiter } from '../../middleware/rateLimiter';
import { authGuard } from '../../middleware/authGuard';
import {
  loginSchema,
  assignTripSchema,
  cancelTripAdminSchema,
  completeTripAdminSchema,
  createCarSchema,
  createDriverSchema,
} from './admin.validation';

export const adminRouter = Router();
const adminController = new AdminController();

// Auth
adminRouter.post('/login', rateLimiter('adminLogin'), validateRequest(loginSchema), adminController.login);

// Protected routes below
adminRouter.use(authGuard);

// Trips
adminRouter.get('/trips', adminController.getTrips);
adminRouter.get('/trips/:id', adminController.getTripDetails);
adminRouter.post('/trips/:id/assign', validateRequest(assignTripSchema), adminController.assignTrip);
adminRouter.post('/trips/:id/cancel', validateRequest(cancelTripAdminSchema), adminController.cancelTrip);
adminRouter.post('/trips/:id/complete', validateRequest(completeTripAdminSchema), adminController.completeTrip);

// Cars
adminRouter.get('/cars', adminController.getCars);
adminRouter.post('/cars', validateRequest(createCarSchema), adminController.createCar);

// Drivers
adminRouter.get('/drivers', adminController.getDrivers);
adminRouter.post('/drivers', validateRequest(createDriverSchema), adminController.createDriver);
