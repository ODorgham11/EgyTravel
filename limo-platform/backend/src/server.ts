// ─── Core ───────────────────────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import 'dotenv/config';

// ─── Middleware ──────────────────────────────────────────────────────────────
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';

// ─── Routers ─────────────────────────────────────────────────────────────────
import { citiesRouter } from './modules/cities/cities.router';
import { tripsRouter } from './modules/trips/trips.router';

import { adminRouter } from './modules/admin/admin.router';

// ─────────────────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT ?? 3000;
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(compression());
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/cities', citiesRouter);
app.use('/api/trips', tripsRouter);
app.use('/api/admin', adminRouter);

// ─── Error handling ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
  console.log(`   MOCK_MODE: ${process.env.MOCK_MODE ?? 'false'}`);
});

export default app;
