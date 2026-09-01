import { TripStatus } from '@prisma/client';

export interface CreateTripDto {
  pickupCity: string;
  destinationCity: string;
  requestedAt: string;
  passengerCount: number;
  luggageSmall: number;
  luggageMedium: number;
  luggageLarge: number;
  luggageBackpack: number;
  luggageLaptop: number;
  extraPreferences?: string;
  riderName: string;
  riderPhone: string;
}

export interface ConfirmTripDto {
  confirmationToken: string;
}

export interface CancelTripDto {
  confirmationToken: string;
  reason: string;
}

export interface CreateTripResponse {
  tripId: string;
  status: TripStatus;
  statusUrl: string;
}
