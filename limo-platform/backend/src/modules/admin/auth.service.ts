import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';

export interface AdminPayload {
  id: string;
  phone: string;
}

export class AuthService {
  generateTokens(admin: AdminPayload) {
    const options: jwt.SignOptions = { expiresIn: JWT_EXPIRY as any };
    const accessToken = jwt.sign(admin as object, JWT_SECRET, options);
    // In a real app we'd also generate a refresh token, store its hash in DB, 
    // and return it to be set as an httpOnly cookie.
    // For this prototype, we'll focus on the access token.
    return { accessToken };
  }

  verifyToken(token: string): AdminPayload {
    return jwt.verify(token, JWT_SECRET) as AdminPayload;
  }
}

export const authService = new AuthService();
