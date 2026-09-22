import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class SepayWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.config.get<string>('SEPAY_WEBHOOK_API_KEY');

    if (!apiKey) {
      return true;
    }

    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Apikey ')) {
      throw new UnauthorizedException('Webhook signature is invalid');
    }
    const providedKey = authHeader.slice('Apikey '.length).trim();
    if (providedKey !== apiKey) {
      throw new UnauthorizedException('Webhook signature is invalid');
    }
    return true;
  }
}
