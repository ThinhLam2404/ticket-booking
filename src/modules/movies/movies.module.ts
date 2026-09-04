import { Module } from '@nestjs/common';
import { MoviesController } from './movies.controller.js';
import { MoviesService } from './movies.service.js';

@Module({
  controllers: [MoviesController],
  providers: [MoviesService],
})
export class MoviesModule {}
