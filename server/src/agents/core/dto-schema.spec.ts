import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { dtoToJsonSchema } from './dto-schema.js';

class SampleDto {
  @IsString() @MinLength(2) city!: string;
  @IsOptional() @IsInt() rooms?: number;
}

describe('dtoToJsonSchema', () => {
  it('describes the required fields and leaves the optional ones out of required', () => {
    const schema = dtoToJsonSchema(SampleDto);

    expect(schema.properties?.city).toEqual({ type: 'string' });
    expect(schema.properties?.rooms).toEqual({ type: 'integer' });
    expect(schema.required).toEqual(['city']);
  });

  it('drops fields the tool asked to hide', () => {
    expect(dtoToJsonSchema(SampleDto, ['rooms']).properties?.rooms).toBeUndefined();
  });

  it('refuses a class that has nothing to describe', () => {
    class Empty {}
    expect(() => dtoToJsonSchema(Empty)).toThrow(/no validation metadata/);
  });
});
