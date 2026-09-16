import { PartialType } from '@nestjs/swagger';
import { CreateShowtimeDto } from './create-showtime.dto.js';

export class UpdateShowtimeDto extends PartialType(CreateShowtimeDto) {}
