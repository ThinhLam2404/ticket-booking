import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh-token-example',
    description: 'Refresh token returned by the login or register endpoint',
  })
  @IsString()
  @IsJWT()
  refreshToken!: string;
}
