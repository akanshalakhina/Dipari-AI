import {
  Injectable,
  ExecutionContext,
  CanActivate,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

/**
 * ProfileCompletedGuard
 *
 * Enforces that the business profile is complete before allowing
 * access to protected marketing/content/campaign operations.
 *
 * Returns HTTP 403: "Profile completion required before using this feature. Please complete your business profile first."
 */
@Injectable()
export class ProfileCompletedGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Admin users bypass profile gate
    if (user.role === 'ADMIN') {
      return true;
    }

    // Extract businessId from params, body, query, or user businesses
    const businessId =
      request.params?.businessId ||
      request.body?.businessId ||
      request.query?.businessId ||
      user.businesses?.[0]?.businessId;

    if (!businessId) {
      throw new ForbiddenException(
        'Profile completion required before using this feature. No active business found.',
      );
    }

    // Check business and businessProfile documents in Firestore
    const [businessDoc, profileDoc] = await Promise.all([
      this.firebase.getBusinessById(businessId).catch(() => null),
      this.firebase.getBusinessProfile(businessId).catch(() => null),
    ]);

    const isComplete =
      businessDoc?.profileCompleted === true ||
      profileDoc?.profileCompleted === true;

    if (!isComplete) {
      throw new ForbiddenException(
        'Profile completion required before using this feature. Please complete your business profile first.',
      );
    }

    return true;
  }
}
