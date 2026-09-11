import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({ example: 'Room 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'clx123cinema' })
  @IsString()
  @IsNotEmpty()
  cinemaId!: string;
}

export class UpdateRoomDto {
  @ApiPropertyOptional({ example: 'Room 1' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;
}

export class ListRoomsDto {
  @ApiProperty({ example: 'clx123cinema' })
  @IsString()
  @IsNotEmpty()
  cinemaId!: string;
}
