import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class SocketAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    void context;

    return true;
  }
}
