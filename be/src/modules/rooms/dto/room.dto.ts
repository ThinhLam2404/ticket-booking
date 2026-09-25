import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { RoomFormat } from '@prisma/client';

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

  @ApiPropertyOptional({ enum: RoomFormat, default: RoomFormat.STANDARD })
  @IsOptional()
  @IsEnum(RoomFormat)
  format?: RoomFormat;
}

export class UpdateRoomDto {
  @ApiPropertyOptional({ example: 'Room 1' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: RoomFormat })
  @IsOptional()
  @IsEnum(RoomFormat)
  format?: RoomFormat;
}

export class ListRoomsDto {
  @ApiProperty({ example: 'clx123cinema' })
  @IsString()
  @IsNotEmpty()
  cinemaId!: string;
}
