import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { IS_PUBLIC_KEY } from './public.decorator';

interface User {
  idir_username?: string;
  display_name?: string;
  email?: string;
  roles?: string[];
  [key: string]: unknown; // Allow additional properties from JWT
}

declare module 'express' {
  interface Request {
    user?: User;
  }
}

@Injectable()
export class BCGovAuthGuard implements CanActivate {
  private jwksClient: JwksClient;

  constructor(
    private configService: ConfigService,
    private reflector: Reflector,
  ) {
    const ssoAuthServerUrl = this.configService.get<string>('SSO_AUTH_SERVER_URL');

    // If SSO_AUTH_SERVER_URL includes the full OIDC path, extract the base realm URL
    let jwksUri: string;
    if (ssoAuthServerUrl.includes('/protocol/openid-connect')) {
      // SSO_AUTH_SERVER_URL is the full OIDC endpoint
      jwksUri = ssoAuthServerUrl.replace('/protocol/openid-connect', '') + '/protocol/openid-connect/certs';
    } else {
      // SSO_AUTH_SERVER_URL is the base Keycloak URL
      const realm = this.configService.get<string>('SSO_REALM');
      jwksUri = `${ssoAuthServerUrl}/realms/${realm}/protocol/openid-connect/certs`;
    }

    this.jwksClient = new JwksClient({
      jwksUri,
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No Bearer token provided');
    }

    const token = authHeader.substring(7);

    try {
      const user = await this.validateToken(token);
      // Attach user to request (like Express middleware does)
      request.user = user;
      return true;
    } catch {
      throw new ForbiddenException('Invalid token');
    }
  }

  private async validateToken(token: string): Promise<User> {
    try {
      // Decode token header to get key ID
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded || !decoded.header.kid) {
        throw new UnauthorizedException('Invalid token format');
      }

      // Get signing key
      const key = await this.jwksClient.getSigningKey(decoded.header.kid);
      const signingKey = key.getPublicKey();

      // Determine the correct issuer
      const ssoAuthServerUrl = this.configService.get<string>('SSO_AUTH_SERVER_URL');
      let expectedIssuer: string;
      if (ssoAuthServerUrl.includes('/protocol/openid-connect')) {
        // SSO_AUTH_SERVER_URL is the full OIDC endpoint, issuer is the realm URL
        expectedIssuer = ssoAuthServerUrl.replace('/protocol/openid-connect', '');
      } else {
        // SSO_AUTH_SERVER_URL is the base Keycloak URL
        const realm = this.configService.get<string>('SSO_REALM');
        expectedIssuer = `${ssoAuthServerUrl}/realms/${realm}`;
      }

      // Verify and decode token
      const verified = jwt.verify(token, signingKey, {
        algorithms: ['RS256'],
        issuer: expectedIssuer,
      });

      return verified as User;
    } catch {
      throw new UnauthorizedException('Token validation failed');
    }
  }
}
