import { prisma } from '../../lib/prisma';
import { CreateTripDto, ConfirmTripDto, CancelTripDto, CreateTripResponse } from './trips.types';
import { createError } from '../../middleware/errorHandler';

export class TripsService {
  async createTrip(data: CreateTripDto): Promise<CreateTripResponse> {
    const trip = await prisma.trip.create({
      data: {
        pickupCity: data.pickupCity,
        destinationCity: data.destinationCity,
        requestedAt: new Date(data.requestedAt),
        passengerCount: data.passengerCount,
        luggageSmall: data.luggageSmall ?? 0,
        luggageMedium: data.luggageMedium ?? 0,
        luggageLarge: data.luggageLarge ?? 0,
        luggageBackpack: data.luggageBackpack ?? 0,
        luggageLaptop: data.luggageLaptop ?? 0,
        extraPreferences: data.extraPreferences,
        riderName: data.riderName,
        riderPhone: data.riderPhone,
        status: 'PENDING',
      },
    });

    console.log(`[TripsService] Created Trip ${trip.id}. Would enqueue whatsapp:notify-admin job here.`);

    return {
      tripId: trip.id,
      status: trip.status,
      statusUrl: `/trip/${trip.id}`,
    };
  }

  async getTrip(id: string) {
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        assignment: {
          include: { car: true, driver: true },
        },
        payment: true,
      },
    });

    if (!trip) {
      throw createError('Trip not found', 404);
    }

    // Strip sensitive info
    const response: any = {
      id: trip.id,
      pickupCity: trip.pickupCity,
      destinationCity: trip.destinationCity,
      requestedAt: trip.requestedAt,
      status: trip.status,
      riderName: trip.riderName,
    };

    if (trip.assignment) {
      response.assignment = {
        carModel: trip.assignment.car.model,
        carColor: trip.assignment.car.color,
        carPlate: trip.assignment.car.plateNumber,
        driverName: trip.assignment.driver.name,
        driverPhone: trip.assignment.driver.phone,
        price: trip.assignment.price,
        currency: trip.assignment.currency,
        exactPickupTime: trip.assignment.exactPickupTime,
        paymentMethod: trip.assignment.paymentMethod,
      };
    }

    if (trip.payment) {
      response.payment = {
        status: trip.payment.status,
        method: trip.payment.method,
      };
    }

    return response;
  }

  async confirmTrip(id: string, data: ConfirmTripDto) {
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: { assignment: true },
    });

    if (!trip) {
      throw createError('Trip not found', 404);
    }

    if (trip.status !== 'ASSIGNED') {
      throw createError('Trip cannot be confirmed at this time', 409);
    }

    if (!trip.assignment) {
      throw createError('No assignment details found for this trip', 409);
    }

    if (trip.assignment.confirmationToken !== data.confirmationToken) {
      throw createError('Invalid confirmation token', 403);
    }

    if (new Date() > trip.assignment.confirmationTokenExpiresAt) {
      throw createError('Confirmation link has expired', 410);
    }

    await prisma.trip.update({
      where: { id },
      data: { status: 'CONFIRMED' },
    });

    if (trip.assignment.paymentMethod === 'ONLINE') {
      return { message: 'Trip confirmed. Proceed to payment.', checkoutUrl: `/api/payments/${id}/initiate` };
    }

    return { message: 'Trip confirmed successfully.' };
  }

  async cancelTrip(id: string, data: CancelTripDto) {
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: { assignment: true, payment: true },
    });

    if (!trip) {
      throw createError('Trip not found', 404);
    }

    if (trip.status !== 'PENDING' && trip.status !== 'ASSIGNED') {
      throw createError('Trip cannot be cancelled at this stage. Please contact support.', 409);
    }

    if (trip.status === 'ASSIGNED') {
      if (!trip.assignment || trip.assignment.confirmationToken !== data.confirmationToken) {
        throw createError('Invalid or missing confirmation token for assigned trip', 403);
      }
    }

    await prisma.trip.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledBy: 'RIDER',
        cancellationReason: data.reason,
        cancelledAt: new Date(),
      },
    });

    if (trip.payment && trip.payment.status === 'PAID') {
      console.log(`[TripsService] Would enqueue payment:refund job for Trip ${id}`);
    }

    console.log(`[TripsService] Would enqueue whatsapp:notify-admin-cancelled job for Trip ${id}`);

    return { message: 'Trip cancelled successfully.' };
  }
}
