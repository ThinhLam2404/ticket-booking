import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class EmailVerificationRequiredResponseDto {
  @ApiProperty({ example: true })
  verificationRequired!: true;

  @ApiProperty({ example: 'customer@example.com' })
  email!: string;
}

export class VerifyEmailDto {
  @ApiProperty({ example: 'hex-verification-token' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class ResendVerificationEmailDto {
  @ApiProperty({ example: 'customer@example.com', format: 'email' })
  @IsEmail()
  email!: string;
}

export class EmailVerificationResponseDto {
  @ApiProperty({ example: true })
  verified!: true;
}

export class EmailVerificationResendResponseDto {
  @ApiProperty({ example: true })
  sent!: true;
}
