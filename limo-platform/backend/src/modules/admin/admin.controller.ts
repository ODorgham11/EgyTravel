import { Request, Response, NextFunction } from 'express';
import { AdminService } from './admin.service';

const adminService = new AdminService();

export class AdminController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminService.login(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getTrips(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await adminService.getTrips(status, page, limit);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getTripDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminService.getTripDetails(req.params.id as string);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async assignTrip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = req.admin!.id;
      const result = await adminService.assignTrip(req.params.id as string, adminId, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async cancelTrip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminService.cancelTrip(req.params.id as string, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async completeTrip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminService.completeTrip(req.params.id as string);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  // --- Cars ---
  async getCars(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminService.getCars();
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async createCar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminService.createCar(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  // --- Drivers ---
  async getDrivers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminService.getDrivers();
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async createDriver(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await adminService.createDriver(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
}
