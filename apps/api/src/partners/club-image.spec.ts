import { clubImagePath, decodeClubImage } from './club-image';

describe('club images', () => {
  it('decodes raster data URLs only', () => {
    const image = decodeClubImage('data:image/webp;base64,AAEC');
    expect(image?.contentType).toBe('image/webp');
    expect([...image!.body]).toEqual([0, 1, 2]);
    expect(decodeClubImage('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull();
    expect(decodeClubImage('https://example.com/logo.png')).toBeNull();
  });

  it('versions the public path with the upload time', () => {
    expect(clubImagePath('id', 'photo', new Date(5))).toBe(
      '/partners/id/photo?v=5',
    );
    expect(clubImagePath('id', 'logo', null)).toBeNull();
  });
});
