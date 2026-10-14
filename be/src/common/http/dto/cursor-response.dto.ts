import { ApiProperty } from '@nestjs/swagger';

export class CursorPaginationMetaDto {
  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;

  @ApiProperty({ nullable: true })
  previousCursor!: string | null;
}
