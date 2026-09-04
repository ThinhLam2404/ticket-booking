import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { MoviesModule } from './modules/movies/movies.module.js';
import { CinemasModule } from './modules/cinemas/cinemas.module.js';
import { RoomsModule } from './modules/rooms/rooms.module.js';
import { SeatsModule } from './modules/seats/seats.module.js';
import { ShowtimesModule } from './modules/showtimes/showtimes.module.js';
import { BookingsModule } from './modules/bookings/bookings.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { TicketsModule } from './modules/tickets/tickets.module.js';
import { DatabaseModule } from './database/database.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    MoviesModule,
    CinemasModule,
    RoomsModule,
    SeatsModule,
    ShowtimesModule,
    BookingsModule,
    PaymentsModule,
    TicketsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
