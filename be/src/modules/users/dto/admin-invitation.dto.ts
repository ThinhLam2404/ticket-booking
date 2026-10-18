import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdminPermission } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAdminInvitationDto {
  @ApiProperty({ example: 'new-admin@example.com', format: 'email' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ enum: AdminPermission, isArray: true, minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(AdminPermission, { each: true })
  permissions!: AdminPermission[];
}

export class ListAdminInvitationsDto {
  @ApiPropertyOptional({ example: 'new-admin@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}

export class AdminInvitationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ enum: AdminPermission, isArray: true })
  permissions!: AdminPermission[];

  @ApiProperty()
  invitedById!: string;

  @ApiProperty({ type: String, nullable: true })
  acceptedById!: string | null;

  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] })
  status!: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

  @ApiProperty({ enum: ['PENDING', 'SENT', 'FAILED', 'UNKNOWN'] })
  emailStatus!: 'PENDING' | 'SENT' | 'FAILED' | 'UNKNOWN';

  @ApiProperty({ format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  acceptedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  revokedAt!: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class AdminInvitationMutationResponseDto extends AdminInvitationResponseDto {}
