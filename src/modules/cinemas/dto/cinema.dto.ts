import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCinemaDto {
  @ApiProperty({ example: 'CGV Landmark 81' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: '208 Nguyen Huu Canh, Ho Chi Minh City' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address!: string;
}

export class UpdateCinemaDto {
  @ApiPropertyOptional({ example: 'CGV Landmark 81' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: '208 Nguyen Huu Canh, Ho Chi Minh City' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address?: string;
}
