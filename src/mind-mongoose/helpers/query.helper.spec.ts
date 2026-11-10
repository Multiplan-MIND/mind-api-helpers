import { Query } from 'mongoose';

import { QueryOptionsInput, SortEnum } from '../../mind-graphql/entities/query.entities';
import { getOptions } from './query.helper';

// Stub the GraphQL decorators so the input types load without a `graphql` runtime
jest.mock('@nestjs/graphql', () => ({
  Field: () => () => undefined,
  InputType: () => () => undefined,
  registerEnumType: jest.fn(),
  Int: 'Int',
}));

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

    const options = getOptions(opt);

    expect(options).toEqual({ skip: 5, limit: 20, sort: { updatedAt: -1, name: 1 } });
    // Key order is the sort precedence
    expect(Object.keys(options.sort!)).toEqual(['updatedAt', 'name']);
  });

  it('should keep every sort field once Mongoose applies the options', () => {
    // An array `sort` is spread into Query#sort(...): Mongoose 7 throws "sort() only takes 1 Argument" and
    // newer versions silently keep only the first field
    const opt = {
      sort: [
        { field: 'createdAt', sort: SortEnum.ASC },
        { field: '_id', sort: SortEnum.DESC },
      ],
    } as QueryOptionsInput;

    const query = new Query().setOptions(getOptions(opt));

    expect(query.getOptions().sort).toEqual({ createdAt: 1, _id: -1 });
  });

  it('should leave skip and limit out when they are falsy and return an empty sort', () => {
    expect(getOptions({ skip: 0, limit: 0 } as QueryOptionsInput)).toEqual({ sort: {} });
  });
});
