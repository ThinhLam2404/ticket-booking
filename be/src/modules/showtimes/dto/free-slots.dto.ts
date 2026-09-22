import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class FreeSlotsQueryDto {
  @ApiProperty({
    example: '2026-10-01',
    description: 'Calendar date in Asia/Ho_Chi_Minh (YYYY-MM-DD)',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date must use the YYYY-MM-DD format',
  })
  date!: string;

  @ApiProperty({ example: 120, description: 'Movie duration in minutes' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes!: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Turnaround minutes kept clear around existing showtimes',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(180)
  turnaroundMinutes = 20;
}

export class FreeSlotWindowDto {
  @ApiProperty({ example: '2026-10-01T08:00:00.000Z', format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ example: '2026-10-01T10:30:00.000Z', format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ example: 150, description: 'Free minutes in this window' })
  minutes!: number;
}

export class BusySlotDto {
  @ApiProperty({ example: '2026-10-01T14:00:00.000Z', format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ example: '2026-10-01T16:00:00.000Z', format: 'date-time' })
  endsAt!: string;
}

export class FreeSlotsResponseDto {
  @ApiProperty({ example: 'clx123room' })
  roomId!: string;

  @ApiProperty({ example: '2026-10-01' })
  date!: string;

  @ApiProperty({ example: 120 })
  durationMinutes!: number;

  @ApiProperty({ example: 20 })
  turnaroundMinutes!: number;

  @ApiProperty({ type: [FreeSlotWindowDto] })
  freeWindows!: FreeSlotWindowDto[];

  @ApiProperty({ type: [BusySlotDto] })
  busy!: BusySlotDto[];
}
