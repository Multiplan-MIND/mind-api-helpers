import { Types } from 'mongoose';

import {
  FieldFilterInput,
  OperationEnum,
  QueryOptionsInput,
  SortEnum,
} from '../../mind-graphql/entities/query.entities';
import { getOptions, getQuery } from './query.helper';

// `graphql` is deliberately not a devDependency: consumers install this package with its devDependencies nested,
// and a second `graphql` copy there breaks their schema (`Int` from another realm). Stub the decorators instead.
jest.mock('@nestjs/graphql', () => ({
  Field: () => () => undefined,
  InputType: () => () => undefined,
  registerEnumType: jest.fn(),
  Int: 'Int',
}));

// The input types declare `Date`/`ObjectId`, but GraphQL delivers strings at runtime, which is what `getQuery` casts
const filter = (field: string, op: OperationEnum, values: Record<string, unknown>): FieldFilterInput =>
  ({ field, op, ...values }) as unknown as FieldFilterInput;

describe('getQuery', () => {
  const hex = '64b7f0c2a3b4c5d6e7f80910';
  const otherHex = '64b7f0c2a3b4c5d6e7f80911';

  it('should return an empty query when there are no filters', () => {
    expect(getQuery(undefined)).toEqual({});
    expect(getQuery([])).toEqual({});
  });

  it('should build eq and ne from a single scalar value', () => {
    expect(getQuery([filter('name', OperationEnum.eq, { stringValue: 'a' })])).toEqual({ name: 'a' });
    expect(getQuery([filter('age', OperationEnum.ne, { intValue: 3 })])).toEqual({ age: { $ne: 3 } });
    expect(getQuery([filter('active', OperationEnum.boolean, { boolValue: false })])).toEqual({ active: false });
  });

  it('should build in and nin from a list of values', () => {
    expect(getQuery([filter('name', OperationEnum.in, { stringValues: ['a', 'b'] })])).toEqual({
      name: { $in: ['a', 'b'] },
    });
    expect(getQuery([filter('age', OperationEnum.nin, { intValues: [1, 2] })])).toEqual({ age: { $nin: [1, 2] } });
  });

  describe('objectId values', () => {
    // The ObjectId is built with the `mongoose` that resolves from this library, so its bson major must match the
    // consumer's: that is why the peer range is a single Mongoose major
    it.each([
      ['eq', OperationEnum.eq, (value: unknown) => value],
      ['ne', OperationEnum.ne, (value: unknown) => ({ $ne: value })],
    ])('should cast objectIdValue to an ObjectId for %s', (_name, op, wrap) => {
      const query = getQuery([filter('_id', op, { objectIdValue: hex })]);

      const expected = wrap(new Types.ObjectId(hex));
      expect(query).toEqual({ _id: expected });
      const id = (op === OperationEnum.eq ? query['_id'] : query['_id'].$ne) as Types.ObjectId;
      expect(id).toBeInstanceOf(Types.ObjectId);
      expect(id.toHexString()).toBe(hex);
    });

    it.each([
      ['in', OperationEnum.in, '$in'],
      ['nin', OperationEnum.nin, '$nin'],
    ])('should cast objectIdValues to ObjectIds for %s', (_name, op, operator) => {
      const ids = getQuery([filter('ref', op, { objectIdValues: [hex, otherHex] })])['ref'][operator];

      expect(ids).toHaveLength(2);
      ids.forEach((id: unknown) => expect(id).toBeInstanceOf(Types.ObjectId));
      expect(ids.map((id: Types.ObjectId) => id.toHexString())).toEqual([hex, otherHex]);
    });
  });

  it('should cast date values to Date for the date operators', () => {
    const query = getQuery([
      filter('createdAt', OperationEnum.between, { dateValues: ['2030-01-01T00:00:00Z', '2030-02-01T00:00:00Z'] }),
      filter('updatedAt', OperationEnum.gte, { dateValue: '2030-03-01T00:00:00Z' }),
      filter('deletedAt', OperationEnum.lte, { dateValue: '2030-04-01T00:00:00Z' }),
    ]);

    expect(query).toEqual({
      createdAt: { $gte: new Date('2030-01-01T00:00:00Z'), $lte: new Date('2030-02-01T00:00:00Z') },
      updatedAt: { $gte: new Date('2030-03-01T00:00:00Z') },
      deletedAt: { $lte: new Date('2030-04-01T00:00:00Z') },
    });
  });

  it('should invert the bounds for notBetween, as the current behavior does', () => {
    const query = getQuery([filter('age', OperationEnum.notBetween, { intValues: [10, 20] })]);

    expect(query).toEqual({ age: { $lte: 10, $gte: 20 } });
  });

  it('should build regex (case-insensitive) and exists', () => {
    expect(getQuery([filter('name', OperationEnum.regex, { stringValue: '^a' })])).toEqual({
      name: { $regex: '^a', $options: 'i' },
    });
    expect(getQuery([filter('name', OperationEnum.exists, { boolValue: true })])).toEqual({
      name: { $exists: true },
    });
  });

  it('should combine several filters on different fields', () => {
    const query = getQuery([
      filter('name', OperationEnum.eq, { stringValue: 'a' }),
      filter('age', OperationEnum.gte, { intValue: 18 }),
    ]);

    expect(query).toEqual({ name: 'a', age: { $gte: 18 } });
  });
});

describe('getOptions', () => {
  it('should default to skip 0 and limit 100 when no options are given', () => {
    expect(getOptions()).toEqual({ skip: 0, limit: 100 });
  });

  it('should honour the given skip, limit and sort direction', () => {
    const opt = {
      skip: 5,
      limit: 20,
      sort: [
        { field: 'updatedAt', sort: SortEnum.DESC },
        { field: 'name', sort: SortEnum.ASC },
      ],
    } as QueryOptionsInput;

    expect(getOptions(opt)).toEqual({ skip: 5, limit: 20, sort: [{ updatedAt: -1 }, { name: 1 }] });
  });

  it('should leave skip and limit out when they are falsy and return an empty sort', () => {
    expect(getOptions({ skip: 0, limit: 0 } as QueryOptionsInput)).toEqual({ sort: [] });
  });
});
