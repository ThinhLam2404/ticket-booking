import { ApiProperty } from '@nestjs/swagger';

export class ProvinceResponseDto {
  @ApiProperty({ example: 79 })
  code!: number;

  @ApiProperty({ example: 'Thành phố Hồ Chí Minh' })
  name!: string;

  @ApiProperty({ example: 'ho_chi_minh' })
  codename!: string;
}
