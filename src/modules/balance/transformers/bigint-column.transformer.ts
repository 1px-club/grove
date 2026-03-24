// transformers：ORM 在读写实体时自动调用的转换器
// 处理的是：数据库字段 <-> 实体属性
// 数据库里的 BIGINT 列值
// 转成实体里的 bigint
// 或反过来把实体里的 bigint
// 转成数据库可写的值
import { ValueTransformer } from 'typeorm';

/**
 * 把数据库中的 BIGINT 列值与实体中的 bigint 属性互相转换。
 */
export const bigintColumnTransformer: ValueTransformer = {
  to: (value?: bigint | null): string | null | undefined => {
    if (value === null || value === undefined) {
      return value;
    }

    return value.toString();
  },
  from: (value?: string | null): bigint | null | undefined => {
    if (value === null || value === undefined) {
      return value;
    }

    return BigInt(value);
  },
};
