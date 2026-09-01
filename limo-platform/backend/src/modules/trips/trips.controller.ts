import { Request, Response, NextFunction } from 'express';
import { TripsService } from './trips.service';

const tripsService = new TripsService();

export class TripsController {
  async createTrip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await tripsService.createTrip(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getTrip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await tripsService.getTrip(req.params.id as string);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async confirmTrip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await tripsService.confirmTrip(req.params.id as string, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async cancelTrip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await tripsService.cancelTrip(req.params.id as string, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}
