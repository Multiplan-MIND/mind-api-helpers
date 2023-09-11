import { Field, registerEnumType, InputType, Int } from '@nestjs/graphql';

export enum OperationEnum {
  eq,
  ne,
  in,
  nin,
  between,
  notBetween,
  gte,
  lte,
  regex,
  boolean,
  exists,
}
registerEnumType(OperationEnum, { name: 'OperationEnum' });

@InputType()
export class FieldFilterInput {
  @Field()
  field: string;

  @Field(() => OperationEnum)
  op: OperationEnum;

  @Field(() => [String], { nullable: true })
  stringValue?: string;

  @Field(() => [String], { nullable: true })
  stringValues?: string[];

  @Field(() => [Int], { nullable: true })
  intValue?: number;

  @Field(() => [Int], { nullable: true })
  intValues?: number[];

  @Field(() => [Date], { nullable: true })
  dateValue?: Date;

  @Field(() => [Date], { nullable: true })
  dateValues?: Date[];

  @Field(() => [Boolean], { nullable: true })
  boolValue?: boolean;

  @Field(() => [Boolean], { nullable: true })
  boolValues?: boolean[];
}

export enum SortEnum {
  ASC = 1,
  DESC = -1,
}
registerEnumType(SortEnum, { name: 'SortEnum' });

@InputType()
export class Sort {
  constructor(field: string, sort: SortEnum) {
    this.field = field;
    this.sort = sort;
  }

  @Field({ nullable: false })
  field: string;

  @Field({ nullable: false })
  sort: SortEnum;
}

@InputType()
export class QueryOptionsInput {
  @Field({ nullable: true, defaultValue: 10 })
  limit?: number;

  @Field({ nullable: true, defaultValue: 0 })
  skip?: number;

  @Field(() => [Sort], { nullable: true, defaultValue: [new Sort('updatedAt', SortEnum.DESC)] })
  sort?: Sort[];
}
