//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

library ContainerLibrary {

    /**
     * @dev Container Attributes
     *  + _initialTokenSupply Initial ERC-20 token supply
     *  + _entryFee Percentage entry fee
     *  + _exitFee Percentage exit fee
     *  + _minimumAmountUsd Minimum USD amount required to create/enter a container
     *  + _name Name ERC20 token
     *  + _symbol Symbol ERC20 token
     */
    struct ContainerAttributes {
        uint256 initialTokenSupply;
        uint256 entryFeePct;
        uint256 exitFeePct;
        uint256 minimumAmountUsd;
        string name;
        string symbol;
    }

    /**
     * @dev Asset Attributes
     */
    struct Asset {
        address assetAddress;
        uint256 assetPct;
    }

    /**
     * @dev Asset Balance
     */    
    struct AssetBalance {
        address asset;
        uint256 balance;
    }
}
