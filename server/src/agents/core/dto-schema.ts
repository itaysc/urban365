import { defaultMetadataStorage } from 'class-transformer/cjs/storage.js';
import { getMetadataStorage } from 'class-validator';

/** The slice of class-validator's metadata this file reads. The rest is noise here. */
interface FieldMeta {
  type: string;
  name?: string;
  propertyName: string;
  constraints: unknown[];
  each: boolean;
}

/**
 * A JSON schema for a class-validator DTO, small on purpose.
 *
 * The model is shown this on every call, so it carries the type, the enum and which
 * fields are required — and not the message, the min and the max, which the same DTO
 * enforces a moment later when the arguments come back. A field added to the DTO with
 * a validator appears here on the next boot without anyone touching the agent.
 */
export interface JsonSchema {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: readonly (string | number | boolean)[];
  additionalProperties?: false;
}

const NUMBER_NAMES = new Set(['isNumber', 'isLatitude', 'isLongitude']);

export function dtoToJsonSchema(dto: new () => object, omit: string[] = []): JsonSchema {
  const metas = getMetadataStorage().getTargetValidationMetadatas(dto, '', false, false);
  if (metas.length === 0) {
    throw new Error(`${dto.name} has no validation metadata, so it cannot describe a tool.`);
  }

  const hidden = new Set(omit);
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [property, list] of Object.entries(getMetadataStorage().groupByPropertyName(metas))) {
    if (hidden.has(property)) continue;
    properties[property] = propertySchema(dto, property, list);
    if (!list.some((meta) => meta.name === 'isOptional' || meta.type === 'conditionalValidation')) {
      required.push(property);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function propertySchema(dto: new () => object, property: string, list: FieldMeta[]): JsonSchema {
  const named = (name: string) => list.find((meta) => meta.name === name);
  const nested = list.find((meta) => meta.type === 'nestedValidation');
  const many = list.some((meta) => meta.each) || named('isArray') !== undefined;

  if (nested) {
    const child = defaultMetadataStorage.findTypeMetadata(dto, property)?.typeFunction?.();
    const schema =
      typeof child === 'function' ? dtoToJsonSchema(child as new () => object) : { type: 'object' as const };
    return many ? { type: 'array', items: schema } : schema;
  }

  const enumValues = named('isIn')?.constraints?.[0];
  const enumSchema: JsonSchema = Array.isArray(enumValues) ? { enum: enumValues } : {};

  if (many) {
    const itemType = named('isInt') ? 'integer' : NUMBER_NAMES.has(itemName(list)) ? 'number' : 'string';
    return { type: 'array', items: { type: itemType, ...enumSchema } };
  }

  if (named('isBoolean')) return { type: 'boolean' };
  if (named('isInt')) return { type: 'integer', ...enumSchema };
  if ([...NUMBER_NAMES].some((name) => named(name))) return { type: 'number', ...enumSchema };
  return { type: 'string', ...enumSchema };
}

/** The scalar validator on an array's items, ignoring the array marker itself. */
function itemName(list: FieldMeta[]): string {
  return list.find((meta) => meta.each && meta.name && meta.name !== 'isArray')?.name ?? '';
}
