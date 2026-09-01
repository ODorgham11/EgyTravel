import { Router, Request, Response } from 'express';
import { CITIES } from './cities.data';

export const citiesRouter = Router();

citiesRouter.get('/', (_req: Request, res: Response) => {
  res.json(CITIES);
});
