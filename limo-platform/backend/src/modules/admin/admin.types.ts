export interface LoginDto {
  phone: string;
  passwordHash?: string; // In the real request, this is `password`, but we keep it generic in the DTO or we use password
  password?: string;
}

export interface AssignTripDto {
  carId: string;
  driverId: string;
  price: number;
  exactPickupTime: string;
  paymentMethod: 'ONLINE' | 'OFFLINE';
}

export interface CancelTripAdminDto {
  reason: string;
}

export interface CreateCarDto {
  model: string;
  color: string;
  plateNumber: string;
  capacity: number;
  owned: boolean;
}

export interface CreateDriverDto {
  name: string;
  phone: string;
  isExternal: boolean;
}
