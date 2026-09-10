import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ example: 'clx123showtime' })
  @IsString()
  @IsNotEmpty()
  showtimeId!: string;

  @ApiProperty({
    example: ['clx123showtimeSeatA1', 'clx123showtimeSeatA2'],
    type: [String],
    minItems: 1,
    maxItems: 10,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  showtimeSeatIds!: string[];
}
