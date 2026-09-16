import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MoviesController } from './movies.controller.js';
import { MoviesService } from './movies.service.js';
import { TmdbClient } from './tmdb.client.js';

@Module({
  imports: [AuthModule],
  controllers: [MoviesController],
  providers: [MoviesService, TmdbClient],
  exports: [MoviesService],
})
export class MoviesModule {}
