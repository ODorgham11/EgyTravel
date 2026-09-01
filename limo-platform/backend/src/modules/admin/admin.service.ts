import { prisma } from '../../lib/prisma';
import argon2 from 'argon2';
import { authService } from './auth.service';
import { createError } from '../../middleware/errorHandler';
import { LoginDto, AssignTripDto, CancelTripAdminDto, CreateCarDto, CreateDriverDto } from './admin.types';
import { Prisma } from '@prisma/client';

export class AdminService {
  async login(data: LoginDto) {
    const admin = await prisma.admin.findUnique({
      where: { phone: data.phone },
    });

    if (!admin || !data.password) {
      throw createError('Invalid credentials', 401);
    }

    const isValid = await argon2.verify(admin.passwordHash, data.password);
    if (!isValid) {
      throw createError('Invalid credentials', 401);
    }

    const tokens = authService.generateTokens({ id: admin.id, phone: admin.phone });
    return {
      accessToken: tokens.accessToken,
      admin: { id: admin.id, phone: admin.phone },
    };
  }

  async getTrips(status?: string, page = 1, limit = 20) {
    const where = status ? { status: status as any } : {};
    const skip = (page - 1) * limit;

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { assignment: true, payment: true },
      }),
      prisma.trip.count({ where }),
    ]);

    return {
      trips,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getTripDetails(id: string) {
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        assignment: {
          include: { car: true, driver: true, assignedBy: true },
        },
        payment: true,
      },
    });

    if (!trip) throw createError('Trip not found', 404);
    return trip;
  }

  async assignTrip(tripId: string, adminId: string, data: AssignTripDto) {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw createError('Trip not found', 404);
    if (trip.status !== 'PENDING') throw createError('Trip must be PENDING to assign', 409);

    const exactPickup = new Date(data.exactPickupTime);
    
    // Configurable buffer window for intercity trips (e.g. 6 hours before and after)
    const bufferBefore = new Date(exactPickup.getTime() - 6 * 60 * 60 * 1000);
    const bufferAfter = new Date(exactPickup.getTime() + 6 * 60 * 60 * 1000);

    // Double booking check
    const conflicts = await prisma.tripAssignment.findMany({
      where: {
        OR: [{ carId: data.carId }, { driverId: data.driverId }],
        trip: { status: { in: ['ASSIGNED', 'CONFIRMED'] } },
        exactPickupTime: {
          gte: bufferBefore,
          lte: bufferAfter,
        },
      },
      include: { trip: true },
    });

    if (conflicts.length > 0) {
      throw createError('Conflict: Car or Driver is already booked during this time window', 409);
    }

    const expiryWindow = Number(process.env.TRIP_ASSIGNED_EXPIRY_MINUTES || '30');
    const expiresAt = new Date(Date.now() + expiryWindow * 60 * 1000);

    const updatedTrip = await prisma.$transaction(async (tx) => {
      const assignment = await tx.tripAssignment.create({
        data: {
          tripId,
          carId: data.carId,
          driverId: data.driverId,
          price: data.price,
          exactPickupTime: exactPickup,
          paymentMethod: data.paymentMethod,
          assignedById: adminId,
          confirmationTokenExpiresAt: expiresAt,
        },
      });

      return tx.trip.update({
        where: { id: tripId },
        data: { status: 'ASSIGNED' },
        include: { assignment: true },
      });
    });

    console.log(`[AdminService] Would enqueue whatsapp:notify-rider job for Trip ${tripId}`);
    return updatedTrip;
  }

  async cancelTrip(tripId: string, data: CancelTripAdminDto) {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { payment: true },
    });

    if (!trip) throw createError('Trip not found', 404);
    if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(trip.status)) {
      throw createError('Trip cannot be cancelled at this stage', 409);
    }

    const updated = await prisma.trip.update({
      where: { id: tripId },
      data: {
        status: 'CANCELLED',
        cancelledBy: 'ADMIN',
        cancellationReason: data.reason,
        cancelledAt: new Date(),
      },
    });

    if (trip.payment && trip.payment.status === 'PAID') {
      console.log(`[AdminService] Would enqueue payment:refund job for Trip ${tripId}`);
    }

    console.log(`[AdminService] Would enqueue whatsapp:notify-rider-cancelled job for Trip ${tripId}`);
    return updated;
  }

  async completeTrip(tripId: string) {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      include: { assignment: true, payment: true },
    });

    if (!trip) throw createError('Trip not found', 404);
    if (trip.status !== 'CONFIRMED') throw createError('Only confirmed trips can be completed', 409);

    return prisma.$transaction(async (tx) => {
      if (trip.assignment?.paymentMethod === 'OFFLINE') {
        if (!trip.payment) {
          await tx.payment.create({
            data: {
              tripId,
              method: 'OFFLINE',
              amount: trip.assignment.price,
              currency: trip.assignment.currency,
              status: 'PAID',
              paidAt: new Date(),
            },
          });
        } else if (trip.payment.status === 'PENDING') {
          await tx.payment.update({
            where: { id: trip.payment.id },
            data: { status: 'PAID', paidAt: new Date() },
          });
        }
      }

      return tx.trip.update({
        where: { id: tripId },
        data: { status: 'COMPLETED' },
      });
    });
  }

  // --- Car Management ---
  async getCars() {
    return prisma.car.findMany();
  }
  async createCar(data: CreateCarDto) {
    return prisma.car.create({ data });
  }

  // --- Driver Management ---
  async getDrivers() {
    return prisma.driver.findMany();
  }
  async createDriver(data: CreateDriverDto) {
    return prisma.driver.create({ data });
  }
}
