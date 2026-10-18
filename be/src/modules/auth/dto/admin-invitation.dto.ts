import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { AdminPermission } from '@prisma/client';
import { IsEmail, IsString, IsNotEmpty, MaxLength, MinLength } from 'class-validator';

export class PreviewAdminInvitationDto {
  @ApiProperty({ example: 'invitation-token' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token!: string;
}

export class AcceptAdminInvitationDto {
  @ApiProperty({ example: 'invitation-token' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token!: string;

  @ApiProperty({ example: 'Nguyen Van A', minLength: 2, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @ApiProperty({ example: 'new-admin@example.com', format: 'email' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'Password123!', minLength: 8, maxLength: 128, format: 'password' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class AdminInvitationPreviewResponseDto {
  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ enum: AdminPermission, isArray: true })
  permissions!: AdminPermission[];

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;
}

export class AdminInvitationAcceptedResponseDto {
  @ApiProperty({ example: true })
  accepted!: boolean;

  @ApiProperty({ format: 'email' })
  email!: string;
}
