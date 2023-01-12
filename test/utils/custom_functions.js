const { ethers } = require("hardhat");
const { isBytes, isHexString } = require("@ethersproject/bytes");

/**
 * Check if a value can be processed as a BigNumber
 * It returns true if the value is a BigNumber, a number, a string, a hex string, a bigint, or a bytes
 * object
 * @param value - The value to check.
 * @returns A boolean value.
 */
const isBigNumberish = (value) => {
  return (value != null) && (
        ethers.BigNumber.isBigNumber(value) ||
        (typeof(value) === "number" && (value % 1) === 0) ||
        (typeof(value) === "string" && !!value.match(/^-?[0-9]+$/)) ||
        isHexString(value) ||
        (typeof(value) === "bigint") ||
        isBytes(value)
  );
}

/**
 * It takes a value and returns a formatted version of that value
 * @param valueToFormat - The value to format.
 * @param [decimals=18] - The number of decimals to format the value to.
 * @returns A string with "decimals" (18 by default) decimal places
 * 
 * Examples: 
 *  1                     ->  "0.000000000000000001"
 *  1.1                   ->  "1.1"
 *  100000000000000000    ->  "0.1"
 *  1000000000000000000   ->  "1.0"
 *  12000000000000000000  ->  "12.0"
 *
 */
const formatUnits = (valueToFormat, decimals = 18) => {
  // Return the same value if it can not be formatted
  if (!isBigNumberish(valueToFormat)) return valueToFormat;

  const _value = (typeof(valueToFormat) === "number") ? ethers.BigNumber.from(String(valueToFormat)) : valueToFormat;
  return ethers.utils.formatUnits(_value, decimals);
}

/**
 * It takes a value and format to returns it as a number
 * @param valueToFormat - The value to format.
 * @param decimals - The number of decimal places to show.
 * @returns The numeric value formatted
 * 
 * Examples: 
 *  1  ->  1e-18
 *  1.1  ->  1.1
 *  100000000000000000  ->  0.1
 *  1000000000000000000  ->  1
 *  12000000000000000000  ->  12
 *
 */
const numberFormatUnits = (valueToFormat, decimals) => {
  return Number(formatUnits(valueToFormat, decimals));
}

module.exports = {
    isBigNumberish,
    formatUnits,
    numberFormatUnits
};