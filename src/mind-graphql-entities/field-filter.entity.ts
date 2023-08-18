import { Field,registerEnumType, InputType, Int} from '@nestjs/graphql';

export enum OperationEnum {
  eq,
  ne,
  includes,
  between,
  notBetween,
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
  operation: OperationEnum;

  @Field(() => [String], { nullable: true })
  stringValues: [string];

  @Field(() => [Int], { nullable: true })
  intValues: [number];

  @Field(() => [Date], { nullable: true })
  dateValues: [Date];

  @Field(() => [Boolean], { nullable: true })
  boolValues: [boolean];
}
