import { BadRequestException } from '@nestjs/common';
import { parseCsv } from './inventory.service';

describe('inventory CSV parser', () => {
  it('parses quoted commas, escaped quotes and CRLF', () => {
    expect(parseCsv('a,b,c\r\n1,"two,parts","say ""hi"""\r\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'two,parts', 'say "hi"'],
    ]);
  });

  it('rejects an unclosed quoted cell', () => {
    expect(() => parseCsv('a,"broken')).toThrow(BadRequestException);
  });
});
