/**
 * 把十进制字符串金额转换成“分”为单位的整数。
 * 例如：'12.34' -> 1234n，'-5.00' -> -500n
 * @param value API 请求中的字符串金额。
 * @returns 以分为单位的 bigint 整数金额。
 */
export function decimalToMinorUnit(value: string): bigint {
  const isNegative = value.startsWith('-');
  const normalized = isNegative ? value.slice(1) : value;
  const [wholePart, fractionalPart = ''] = normalized.split('.');
  const paddedFraction = `${fractionalPart}00`.slice(0, 2);
  const minorUnit = BigInt(wholePart) * 100n + BigInt(paddedFraction);

  return isNegative ? -minorUnit : minorUnit;
}

/**
 * 把“分”为单位的整数金额转换回两位小数的字符串。
 * 例如：1234n -> '12.34'，-500n -> '-5.00'
 * @param value 以分为单位的 bigint 整数金额。
 * @returns 标准两位小数字符串金额。
 */
export function minorUnitToDecimal(value: bigint): string {
  const isNegative = value < 0n;
  const normalized = isNegative ? -value : value;
  const wholePart = normalized / 100n;
  const fractionalPart = (normalized % 100n).toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}${wholePart.toString()}.${fractionalPart}`;
}
