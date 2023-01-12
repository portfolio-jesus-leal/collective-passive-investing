//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "./ContainerLibrary.sol";

/**
 *  @title Asset trading interface
 *  @author Jesús Leal
 *  @notice Interface for contract Trading.sol
 */
interface ITrading {

    /**
     * @notice Emitted when a amount is received using the function "receive" (fallback)
     * @param from Address from which the amount is received
     * @param amount Amount received
     */
    event Received(address indexed from, uint256 amount);
    /**
     * @notice Emitted when a amount is transfered using the function "transferTo"
     * @param to Address to which the amount is sent
     * @param amount Amount sent
     */
    event Transfer(address indexed to, uint256 amount);
    /**
     * @notice Emitted when buy or sell a ERC-20 token
     * @param tokenIn Address token to sell
     * @param amountIn Amount token to sell
     * @param tokenOut Address token to buy
     * @param amountOut Amount token to buy     
     */
    event TradeAsset(address indexed tokenIn, uint256 amountIn, address indexed tokenOut, uint256 amountOut);

    receive() external payable;

    function transferTo(address _to, uint256 _amountEth) external payable;

    function buyAssetList(ContainerLibrary.Asset[] calldata _assetList) external payable; 

    function rebalanceAssetList(ContainerLibrary.Asset[] calldata _assetList) external;

    function swapAsset(uint256 _amountIn, address _tokenIn, address _tokenOut) 
        external 
        returns (uint256[] memory amounts);

    function sellAssetList(ContainerLibrary.Asset[] calldata _assetList, uint256 _percentage) 
        external 
        returns (uint256 sellingAmount);

    function getAssetBalance(address _asset, address _of)
        external 
        view
        returns (uint256);

    function getAssetsOwned(address _of) 
        external 
        view 
        returns (ContainerLibrary.AssetBalance[] memory);

    function pause() external; 
    
    function unpause() external;
}