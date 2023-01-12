//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

/**
 *  @title Utils interface
 *  @author Jesús Leal
 *  @notice Interface for contract Utils.sol
 */
interface IUtils {

    /**
     * @notice Event NewPriceFeedAddress - Emitted when the address of the Price Feed contract is updated
     * @param newPriceFeedAddress New address
     */
    event NewPriceFeedAddress(address indexed newPriceFeedAddress);

    function calculateEthInUsd(uint256 _amount) external returns (uint256);

    /**
     * @notice Set a new address for the Price Feed contract (public function only allowed to DEFAULT_ADMIN_ROLE)
     * @dev Wraps the internal function to make the functionality external
     * @param _priceFeedAddress New address for Price Feed contract
     */
    function setPriceFeedAddress(address _priceFeedAddress) external;

    /**
     * @notice Get the address of Price Feed contract
     * @return Price Feed contract address
     */
    function getPriceFeedAddress() external view returns (address);
    
    /**
     * @notice Get the number of decimal positions for amounts in USD
     * @return Decimal positions for USD amounts
     */
    function getUsdDecimals() external view returns (uint256);

    /**
     * @notice Get the exchange rate ETH/USD
     * @return Exchange rate ETH/USD
     */
    function getRateEthUsd() external view returns (uint256); 
}