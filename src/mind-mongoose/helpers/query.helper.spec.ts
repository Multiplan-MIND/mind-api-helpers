import { Types } from 'mongoose';

import {
  FieldFilterInput,
  OperationEnum,
  QueryOptionsInput,
  SortEnum,
} from '../../mind-graphql/entities/query.entities';
import { getOptions, getQuery } from './query.helper';

// `graphql` is a peer of @nestjs/graphql and is not installed in this package; only the decorators are needed here.
jest.mock('@nestjs/graphql', () => ({
  Field: () => () => undefined,
  InputType: () => () => undefined,
  registerEnumType: () => undefined,
  Int: {},
}));

const f = (partial: Partial<FieldFilterInput>) => partial as FieldFilterInput;

describe('getQuery', () => {
  it('should return an empty query without filters', () => {
    expect(getQuery(undefined)).toEqual({});
    expect(getQuery([])).toEqual({});
  });

  it.each([
    [OperationEnum.eq, { name: 'a' }],
    [OperationEnum.ne, { name: { $ne: 'a' } }],
    [OperationEnum.in, { name: { $in: ['a'] } }],
    [OperationEnum.nin, { name: { $nin: ['a'] } }],
    [OperationEnum.gte, { name: { $gte: 'a' } }],
    [OperationEnum.lte, { name: { $lte: 'a' } }],
    [OperationEnum.regex, { name: { $regex: 'a', $options: 'i' } }],
    [OperationEnum.boolean, { name: 'a' }],
    [OperationEnum.exists, { name: { $exists: 'a' } }],
  ])('should map operation %p', (op, expected) => {
    expect(getQuery([f({ field: 'name', op, stringValue: 'a' })])).toEqual(expected);
  });

  it('should map between and notBetween', () => {
    expect(getQuery([f({ field: 'n', op: OperationEnum.between, intValues: [1, 5] })])).toEqual({
      n: { $gte: 1, $lte: 5 },
    });
    expect(getQuery([f({ field: 'n', op: OperationEnum.notBetween, intValues: [1, 5] })])).toEqual({
      n: { $lte: 1, $gte: 5 },
    });
  });

  it('should convert each value type', () => {
    expect(getQuery([f({ field: 'n', op: OperationEnum.eq, intValue: 7 })])).toEqual({ n: 7 });
    expect(getQuery([f({ field: 'b', op: OperationEnum.eq, boolValue: false })])).toEqual({ b: false });
    expect(getQuery([f({ field: 'b', op: OperationEnum.in, boolValues: [true, false] })])).toEqual({
      b: { $in: [true, false] },
    });
    expect(getQuery([f({ field: 'd', op: OperationEnum.eq, dateValue: '2024-01-01' as any })])).toEqual({
      d: new Date('2024-01-01'),
    });
    expect(
      getQuery([f({ field: 'd', op: OperationEnum.in, dateValues: ['2024-01-01', '2024-02-01'] as any })]),
    ).toEqual({ d: { $in: [new Date('2024-01-01'), new Date('2024-02-01')] } });
  });

  it('should convert object ids', () => {
    const id = new Types.ObjectId();
    expect(getQuery([f({ field: '_id', op: OperationEnum.eq, objectIdValue: id.toString() as any })])).toEqual({
      _id: id,
    });
    expect(getQuery([f({ field: '_id', op: OperationEnum.in, objectIdValues: [id.toString()] as any })])).toEqual({
      _id: { $in: [id] },
    });
  });

  it('should combine several filters', () => {
    expect(
      getQuery([
        f({ field: 'a', op: OperationEnum.eq, stringValue: '1' }),
        f({ field: 'b', op: OperationEnum.ne, stringValue: '2' }),
      ]),
    ).toEqual({ a: '1', b: { $ne: '2' } });
  });
});

describe('getOptions', () => {
  it('should default to skip 0 and limit 100', () => {
    expect(getOptions()).toEqual({ skip: 0, limit: 100 });
  });

  it('should map skip, limit and sort', () => {
    const opt = {
      skip: 10,
      limit: 5,
      sort: [
        { field: 'name', sort: SortEnum.ASC },
        { field: 'createdAt', sort: SortEnum.DESC },
      ],
    } as QueryOptionsInput;
    expect(getOptions(opt)).toEqual({ skip: 10, limit: 5, sort: [{ name: 1 }, { createdAt: -1 }] });
  });

  it('should return an empty sort list when only limit is informed', () => {
    expect(getOptions({ limit: 3 } as QueryOptionsInput)).toEqual({ limit: 3, sort: [] });
  });
});
