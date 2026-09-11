import { PartialType } from '@nestjs/swagger';
import { CreateMovieDto } from './create-movie.dto.js';

export class UpdateMovieDto extends PartialType(CreateMovieDto) {}
