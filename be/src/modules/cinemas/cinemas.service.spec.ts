import { CinemasService } from './cinemas.service.js';

describe('CinemasService province filtering', () => {
  it('filters the cinema list by province code and exposes province metadata', async () => {
    const cinemaFindMany = vi.fn().mockResolvedValue([
      {
        id: 'cinema-1',
        name: 'Central Cinema',
        address: '1 Example Street',
        provinceCode: 79,
        _count: { rooms: 2 },
      },
    ]);
    const service = new CinemasService({ cinema: { findMany: cinemaFindMany } } as never);

    await expect(service.findAll({ provinceCode: 79 })).resolves.toMatchObject([
      {
        id: 'cinema-1',
        provinceCode: 79,
        province: { code: 79, name: 'Thành phố Hồ Chí Minh' },
        roomCount: 2,
      },
    ]);
    expect(cinemaFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { provinceCode: 79 },
    }));
  });
});
