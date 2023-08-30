import {
  FieldFilterInput,
  OperationEnum,
  QueryOptionsInput,
  SortEnum,
} from '../../mind-graphql/entities/query.entities';

export function getQuery(filters: FieldFilterInput[]) {
  const query = {};
  if (filters) {
    for (const filter of filters) {
      const field = filter.field;
      let values = [];
      if (filter.stringValues) values = filter.stringValues;
      else if (filter.intValues) values = filter.intValues;
      else if (filter.dateValues) {
        for (const date of filter.dateValues) {
          values.push(new Date(date));
        }
      } else if (filter.boolValues) values = filter.boolValues;

      switch (filter.operation) {
        case OperationEnum.eq:
          query[field] = values[0];
          break;
        case OperationEnum.ne:
          query[field] = { $ne: values[0] };
          break;
        case OperationEnum.includes:
          query[field] = { $in: values };
          break;
        case OperationEnum.between:
          query[field] = { $gte: values[0], $lte: values[1] };
          break;
        case OperationEnum.notBetween:
          query[field] = { $lte: values[0], $gte: values[1] };
          break;
        case OperationEnum.regex:
          query[field] = { $regex: values[0], $options: 'i' };
          break;
        case OperationEnum.boolean:
          query[field] = values[0];
          break;
        case OperationEnum.exists:
          query[field] = { $exists: values[0] };
          break;
      }
    }
  }

  return query;
}

export function getOptions(opt?: QueryOptionsInput) {
  const options: { limit?: number; skip?: number; sort?: any } = {};

  if (!opt) {
    options.skip = 0;
    options.limit = 100;
  } else {
    if (opt.skip) options.skip = opt.skip;
    if (opt.limit) options.limit = opt.limit;

    options.sort = [];
    if (opt.sort) {
      for (const s of opt.sort) {
        options.sort.push({ [`${s.field}`]: s.sort === SortEnum.ASC ? 1 : -1 });
      }
    }
  }

  return options;
}
