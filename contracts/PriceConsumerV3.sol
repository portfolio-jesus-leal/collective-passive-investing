// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title The PriceConsumerV3 contract
 * @notice Acontract that returns latest price from Chainlink Price Feeds
 */
contract PriceConsumerV3 {
    AggregatorV3Interface internal immutable priceFeed;

    /**
     * @notice Executes once when a contract is created to initialize state variables
     *
     * @param _priceFeed - Price Feed Address
     *
     * Aggregator: ETH/USD
     * Network     | Address
     * ------------ -------------------------------------------
     * Mainnet     | 0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419
     * Rinkeby     | 0x8A753747A1Fa494EC906cE90E9f37563A8AF630e
     * Polygon     | 0xf9680d99d6c9589e2a93a78a04a279e509205945
     * BSC Mainnet | 0x9ef1b8c0e4f7dc8bf5719ea496883dc6401d5b2e
     */
    constructor(address _priceFeed) {
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    /**
     * @notice Returns the latest price
     *
     * @return latest price
     */
    function getLatestPrice() public view returns (int256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();

        return price;
    }

    /**
     * @notice Returns the Price Feed address
     *
     * @return Price Feed address
     */
    function getPriceFeed() public view returns (AggregatorV3Interface) {
        return priceFeed;
    }

    /**
     * @notice Returns the decimal positions used in prices
     *
     * @return number of decimal positions
     */
    function decimals() public view returns (uint8) {
        return priceFeed.decimals();
    }
}
