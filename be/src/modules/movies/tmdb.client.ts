import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type TmdbMovieListItem = {
  id: number;
  title: string;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  vote_average?: number;
};

export type TmdbMovieList = {
  page: number;
  results: TmdbMovieListItem[];
  total_pages: number;
  total_results: number;
};

export type TmdbMovieDetails = TmdbMovieListItem & {
  runtime?: number | null;
};

@Injectable()
export class TmdbClient {
  private readonly baseUrl = 'https://api.themoviedb.org/3';
  private readonly imageBaseUrl = 'https://image.tmdb.org/t/p';

  constructor(private readonly config: ConfigService) {}

  async listMovies(search: string | undefined, page: number) {
    const params = new URLSearchParams({
      include_adult: 'false',
      language: 'vi-VN',
      page: String(page),
      region: 'VN',
    });
    const path = search?.trim() ? '/search/movie' : '/movie/now_playing';
    if (search?.trim()) params.set('query', search.trim());
    return this.requestWithLanguageFallback<TmdbMovieList>(path, params);
  }

  async movie(id: number) {
    const params = new URLSearchParams({ language: 'vi-VN' });
    return this.requestWithLanguageFallback<TmdbMovieDetails>(`/movie/${id}`, params);
  }

  image(path: string | null | undefined, size: 'w500' | 'w1280') {
    return path ? `${this.imageBaseUrl}/${size}${path}` : null;
  }

  private async requestWithLanguageFallback<T>(
    path: string,
    params: URLSearchParams,
  ): Promise<T> {
    try {
      return await this.request<T>(path, params);
    } catch (error) {
      const canFallback =
        params.get('language') === 'vi-VN' &&
        (error instanceof BadGatewayException ||
          error instanceof GatewayTimeoutException);
      if (!canFallback) throw error;

      const fallbackParams = new URLSearchParams(params);
      fallbackParams.set('language', 'en-US');
      return this.request<T>(path, fallbackParams);
    }
  }

  private async request<T>(path: string, params: URLSearchParams): Promise<T> {
    const token = this.config.get<string>('TMDB_ACCESS_TOKEN')?.trim();
    if (!token) {
      throw new ServiceUnavailableException('TMDB integration is not configured');
    }

    let response: Response | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 300));
      }
      try {
        response = await fetch(`${this.baseUrl}${path}?${params.toString()}`, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(8000),
        });
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!response) {
      if (lastError instanceof DOMException && lastError.name === 'TimeoutError') {
        throw new GatewayTimeoutException('TMDB request timed out');
      }
      throw new BadGatewayException('TMDB connection failed');
    }

    if (response.status === 404) {
      throw new NotFoundException('TMDB movie not found');
    }
    if (response.status === 429) {
      throw new ServiceUnavailableException('TMDB request limit reached');
    }
    if (!response.ok) {
      throw new BadGatewayException('TMDB request failed');
    }

    return (await response.json()) as T;
  }
}
