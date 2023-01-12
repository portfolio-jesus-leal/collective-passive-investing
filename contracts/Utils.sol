//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./PriceConsumerV3.sol";
import "./IUtils.sol";

contract Utils is IUtils, Ownable {

    // ********************
    // Constants
    // ********************
    /// @notice Number of decimal positions for Ether
    uint256 public constant ETH_DECIMALS = 18;

    // ********************
    // Vars
    // ********************
    /// @dev Decimal positions for ETH/USD price (from the Price Feed)
    uint256 private usdDecimals;

    // ********************
    // Vars for contracts
    // ********************
    PriceConsumerV3 internal priceFeed;    

    // ********************
    // Errors
    // ********************
    error RateNotValid();

    constructor(address _priceFeedAddress) {
        _setPriceFeedAddress(_priceFeedAddress);
    }

    function calculateEthInUsd(uint256 _amount) 
        external 
        view
        virtual override
        returns (uint256) 
    {
        if (_amount == 0) return 0;
        return _calculateAmountUsd(_getRateEthUsd(), _amount);
    }

    /**
     * @notice Set a new address for the Price Feed contract (public function only allowed to DEFAULT_ADMIN_ROLE)
     * @dev Wraps the internal function to make the functionality public
     * @param _priceFeedAddress New address for Price Feed contract
     */
    function setPriceFeedAddress(address _priceFeedAddress)
        external
        virtual override
        onlyOwner
    {
        _setPriceFeedAddress(_priceFeedAddress);
        emit NewPriceFeedAddress(_priceFeedAddress);
    }

    /**
     * @notice Get the address of Price Feed contract
     * @return Price Feed contract address
     */
    function getPriceFeedAddress() 
        external 
        view 
        virtual override
        returns (address) 
    {
        return address(priceFeed);
    }

    /**
     * @notice Get the number of decimal positions for amounts in USD
     * @return Decimal positions for USD amounts
     */
    function getUsdDecimals() 
        external 
        view 
        virtual override
        returns (uint256) 
    {
        return usdDecimals;
    }

    /**
     * @notice Get the exchange rate ETH/USD
     * @return Exchange rate ETH/USD
     */
    function getRateEthUsd() 
        external 
        view 
        virtual override
        returns (uint256) 
    {
        return _getRateEthUsd();
    }    

    /**
     * @notice Set a new address for the Price Feed contract (internal function)
     * @param _priceFeedAddress New address for Price Feed contract
     */
    function _setPriceFeedAddress(address _priceFeedAddress) 
        internal 
    {
        require(
            _priceFeedAddress != address(0),
            "Utils: price feed address is 0"
        );

        priceFeed = PriceConsumerV3(_priceFeedAddress);
        usdDecimals = priceFeed.decimals();
    }     

    /**
     * @notice Get the exchange rate ETH/USD
     * @return Exchange rate ETH/USD
     */
    function _getRateEthUsd() 
        internal 
        view 
        returns (uint256) 
    {
        int256 price = priceFeed.getLatestPrice();
        if (price <= 0) revert RateNotValid();

        return uint256(price);
    }      

    /**
     * @notice Calculate the equivalent amount in USD (from ETH)
     * @param _rate Exchange rate ETH/USD
     * @param _amount ETH amount
     * @return Equivalent USD amount
     */
    function _calculateAmountUsd(uint256 _rate, uint256 _amount)
        internal
        view
        returns (uint256)
    {
        return (_rate * _amount) / (10**(ETH_DECIMALS + usdDecimals));
    }
}