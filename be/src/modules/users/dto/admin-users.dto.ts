import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminPermission, UserRole } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthSessionResponseDto } from '../../auth/dto/session.dto.js';

export class ListAdminUsersDto {
  @ApiPropertyOptional({ example: 'customer@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsEnum(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}

export class UpdateUserAccessDto {
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @ApiPropertyOptional({ enum: AdminPermission, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(AdminPermission, { each: true })
  permissions?: AdminPermission[];
}

export class AdminUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ nullable: true, format: 'date-time' })
  disabledAt!: Date | null;

  @ApiProperty({ enum: AdminPermission, isArray: true })
  permissions!: AdminPermission[];

  @ApiProperty()
  activeSessionCount!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class AdminUserSessionDto extends AuthSessionResponseDto {
  @ApiProperty()
  userId!: string;
}
