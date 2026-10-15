import { ApiProperty } from '@nestjs/swagger';

export class AuthSessionResponseDto {
  @ApiProperty({ example: '0f4d5c78-7af2-4a0f-9a0f-1b7a5c5c0e1b' })
  id!: string;

  @ApiProperty({ example: '2026-10-16T09:00:00.000Z', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-10-23T09:00:00.000Z', format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ example: true })
  current!: boolean;
}

export class PasswordChangedResponseDto {
  @ApiProperty({ example: true })
  changed!: true;
}
