import {
  FieldFilterInput,
  OperationEnum,
  QueryOptionsInput,
  SortEnum,
} from '../../mind-graphql/entities/query.entities';

function isNullOrUndefined<T>(obj: T | null | undefined): boolean {
  return typeof obj === 'undefined' || obj === null;
}

export function getQuery(filters: FieldFilterInput[]) {
  const query = {};
  if (filters) {
    for (const filter of filters) {
      const field = filter.field;
      let values = [];
      if (!isNullOrUndefined(filter.stringValue)) values.push(filter.stringValue);
      else if (!isNullOrUndefined(filter.stringValues)) values = filter.stringValues;
      else if (!isNullOrUndefined(filter.intValue)) values.push(filter.intValue);
      else if (!isNullOrUndefined(filter.intValues)) values = filter.intValues;
      else if (!isNullOrUndefined(filter.dateValue)) values.push(new Date(filter.dateValue));
      else if (!isNullOrUndefined(filter.dateValues)) {
        for (const date of filter.dateValues) {
          values.push(new Date(date));
        }
      } else if (!isNullOrUndefined(filter.boolValue)) values.push(filter.boolValue);
      else if (!isNullOrUndefined(filter.boolValues)) values = filter.boolValues;

      switch (filter.op) {
        case OperationEnum.eq:
          query[field] = values[0];
          break;
        case OperationEnum.ne:
          query[field] = { $ne: values[0] };
          break;
        case OperationEnum.in:
          query[field] = { $in: values };
          break;
        case OperationEnum.nin:
          query[field] = { $nin: values };
          break;
        case OperationEnum.between:
          query[field] = { $gte: values[0], $lte: values[1] };
          break;
        case OperationEnum.notBetween:
          query[field] = { $lte: values[0], $gte: values[1] };
          break;
        case OperationEnum.gte:
          query[field] = { $gte: values[0] };
          break;
        case OperationEnum.lte:
          query[field] = { $lte: values[0] };
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
