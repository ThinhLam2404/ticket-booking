import { SetMetadata } from '@nestjs/common';
import type { AdminPermission } from '@prisma/client';

export const PERMISSIONS_KEY = 'admin_permissions';
export const Permissions = (...permissions: AdminPermission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
