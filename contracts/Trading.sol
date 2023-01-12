//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ContainerLibrary.sol";
import "./ITrading.sol";

// import "hardhat/console.sol";

/**
 *  @title Asset trading contract
 *  @author Jesús Leal
 *  @notice It contains the functionality for asset trading.
 *  @dev This contract uses UniSwap V2
 */
contract Trading is ITrading, Pausable, AccessControl, ReentrancyGuard {

    // ********************
    // Constants
    // ********************
    /// @notice Value for TRADER_ROLE
    bytes32 public constant TRADER_ROLE = keccak256("TRADER_ROLE");
    /// @notice Maximum percentage value
    uint256 public constant MAX_PERCENTAGE = 100;
    /// @notice Maximum percentage value (as per ETH decimals)
    uint256 public constant MAX_PERCENTAGE_PRECISION = (10**20);
    /// @notice Minimum percentage value (as per ETH decimals)
    uint256 public constant MIN_PERCENTAGE_PRECISION = (10**8);
    /// @notice Decimal precision (as per ETH decimals)
    uint256 public constant PRECISION = (10**18);
    /// @notice Address private immutable WETH
    address private immutable WETH;

    // ********************
    // Variables
    // ********************
    /// @dev List of ERC20 tokens that are managed by a specific account
    mapping(address => address[]) private assetsOwned;

    // ********************
    // Vars for contracts
    // ********************
    IUniswapV2Router02 internal immutable uniswapV2Router;

    // ********************
    // Errors
    // ********************
    error TransferToFailed();

    /** ***************************************************************************************************
     * @notice Constructor (Container creation)
     * @param _uniswapV2Router UniSwap Router 02 address
     **************************************************************************************************** */
    constructor(
        address _uniswapV2Router
    ) {
        require(
            _uniswapV2Router != address(0),
            "Trading: Router address is 0"
        );

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        uniswapV2Router = IUniswapV2Router02(_uniswapV2Router);
        WETH = uniswapV2Router.WETH();
    }

    /**
     * @notice Fallback function to receive funds
     */
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /**
     * @notice Function to tranfer Ethers to a specific address (only allowed to DEFAULT_ADMIN_ROLE)
     * @param _to Address that receives the transfer
     * @param _amountEth ETH amount to transfer
     */
    function transferTo(address _to, uint256 _amountEth)
        external
        payable
        virtual override
        onlyRole(DEFAULT_ADMIN_ROLE)
        whenNotPaused
    {
        _transferTo(_to, _amountEth);
        emit Transfer(_to, _amountEth);
    }

    function _transferTo(address _to, uint256 _amountEth) internal {
        require(_to != address(0), "Traiding: address not valid");
        require(_amountEth > 0, "Traiding: transfer amount is 0");
        require(
            _amountEth <= address(this).balance,
            "Traiding: insufficient balance"
        );

        (bool success, ) = _to.call{value: _amountEth}("");
        if (!success) revert TransferToFailed();
    }

    function buyAssetList(ContainerLibrary.Asset[] calldata _assetList) 
        external 
        payable 
        virtual override
        whenNotPaused 
    {
        _validateAssetList(_assetList);
        _buyAssetsWithEth(msg.value, _assetList);
        _grantRole(TRADER_ROLE, msg.sender);
    }

    function sellAssetList(ContainerLibrary.Asset[] calldata _assetList, uint256 _sharePercentage) 
        external 
        virtual override
        whenNotPaused 
        onlyRole(TRADER_ROLE) 
        returns (uint256 sellingAmount)
    {
        require(_sharePercentage > MIN_PERCENTAGE_PRECISION, "Trading: Share percent. too low");
        require(_sharePercentage <= MAX_PERCENTAGE_PRECISION, "Trading: Share percentage > 100");
        _validateAssetList(_assetList);
        sellingAmount = _sellAssetsForEth(_assetList, _sharePercentage, msg.sender);
    }

    function rebalanceAssetList(ContainerLibrary.Asset[] calldata _assetList) 
        external 
        virtual override
        nonReentrant
        whenNotPaused
        onlyRole(TRADER_ROLE)
    {
        _validateAssetList(_assetList);

        uint256 _counterLeft = _assetList.length;
        uint256 _totalAmountOutEth;
        uint256 _totalAmountEth;
        uint256[] memory _amountsOutEth = new uint256[](_assetList.length);
        uint256[] memory _amountsToBuyEth = new uint256[](_assetList.length);

        // Calculate the equivalent amount in ETHs for each assets in the list
        for (uint256 _index = 0; _index < _assetList.length; ++_index) {
            uint256 _amountIn = _getAssetBalance(_assetList[_index].assetAddress, msg.sender);
            require(
                _amountIn > 0, 
                "Trading: Asset balance is zero"
            );
            _amountsOutEth[_index] = _calculateAmountOut(
                    _amountIn, 
                    _calculatePath(_assetList[_index].assetAddress, WETH)
            );
            _totalAmountOutEth += _amountsOutEth[_index];
        }

        // Calculate the amount in ethers that should be allocated for each asset
        for (uint256 _index = 0; _index < _assetList.length; ++_index) {
            _amountsToBuyEth[_index] = _calculateAmountToBuy(_totalAmountOutEth, _assetList[_index].assetPct);
        }

        // Sell all those assets that have more value than they should (based on new percentages)
        for (uint256 _index = 0; _index < _assetList.length; ++_index) {
            if (_amountsOutEth[_index] > _amountsToBuyEth[_index]) {
                uint256 _amountDiffEth = _amountsOutEth[_index] - _amountsToBuyEth[_index];
                uint256 _amount = (_amountDiffEth *
                    _getAssetBalance(_assetList[_index].assetAddress, msg.sender)) /
                    _amountsOutEth[_index];
                uint256 _amountEth = _sellAssetForEth(_amount, _assetList[_index].assetAddress, address(this));

                _totalAmountEth += _amountEth;
                _counterLeft--;
            }
        }

        // Buy all those assets that have less value than they should (based on new percentages)
        for (uint256 _index = 0; _index < _assetList.length; ++_index) {
            if (_amountsToBuyEth[_index] > _amountsOutEth[_index]) {
                uint256 _amountDiffEth = _amountsToBuyEth[_index] - _amountsOutEth[_index];

                if (_amountDiffEth > _totalAmountEth || _counterLeft == 1) _amountDiffEth = _totalAmountEth;

                uint256[] memory amountsOut = _buyAsset(_amountDiffEth, WETH, _assetList[_index].assetAddress);

                _totalAmountEth -= amountsOut[0];
                _counterLeft--;
            }
        }

        if (_totalAmountEth > 0) _transferTo(msg.sender, _totalAmountEth);
    }

    function getAssetBalance(address _asset, address _of)
        external 
        view
        virtual override
        returns (uint256) 
    {
        require(_asset != address(0), "Trading: asset address is 0");
        require(_of != address(0), "Trading: of address is 0");
        return _getAssetBalance(_asset, _of);
    }

    function _getAssetBalance(address _asset, address _of) internal view returns (uint256) {
        return IERC20(_asset).balanceOf(_of);
    }

    function _validateAssetList(ContainerLibrary.Asset[] calldata _assetList)
        internal
        pure
    {
        require(_assetList.length > 0, "Trading: Asset list is empty");
        uint256 _totalPct = 0;

        for (uint256 _index = 0; _index < _assetList.length; ++_index) {
            _validateAsset(_assetList[_index]);
            _totalPct += _assetList[_index].assetPct;
        }
        require(_totalPct == MAX_PERCENTAGE, "Trading: total pct is not 100");
    }

    function _validateAsset(ContainerLibrary.Asset memory _asset) internal pure {
        require(
            _asset.assetAddress != address(0),
            "Trading: asset address is 0"
        );
        require(
            _asset.assetPct > 0,
            "Trading: asset pct is 0"
        );
        require(
            _asset.assetPct <= MAX_PERCENTAGE,
            "Trading: asset pct > 100"
        );
    }

    function _buyAssetsWithEth(uint256 _totalAmount, ContainerLibrary.Asset[] calldata _assetList) internal {
        uint256 _amountIn;
        uint256[] memory amountsOut;
        uint256 _amountLeft = _totalAmount;

        for (uint256 _index = 0; _index < _assetList.length - 1; ++_index) {
            _amountIn = _calculateAmountToBuy(_totalAmount, _assetList[_index].assetPct);
            amountsOut = _buyAsset(_amountIn, WETH, _assetList[_index].assetAddress);
            _amountLeft -= amountsOut[0];
        }

        amountsOut = _buyAsset(_amountLeft, WETH, _assetList[_assetList.length - 1].assetAddress);
        _amountLeft -= amountsOut[0];
        require(_amountLeft == 0, "Trading: Left amount is not 0");
    }

    function _buyAsset(uint256 _amountIn, address _tokenIn, address _tokenOut) internal returns (uint256[] memory amounts) {
        amounts = _swap(_amountIn, _tokenIn, _tokenOut, msg.sender);
        // emit TradeAsset(_tokenIn, amounts[0], _tokenOut, amounts[amounts.length - 1]);
    }

    function _addAssetToListOf(address _of, address _token) internal {
        int256 _index = _searchAddress(_token, assetsOwned[_of]);
        if (_index < 0) assetsOwned[_of].push(_token);
    }

    function _searchAddress(address _value, address[] memory _list) internal pure returns (int256) {
        for (uint256 _index = 0; _index < _list.length; ++_index) {
            if (_list[_index] == _value) return int256(_index);
        }
        return -1;
    }

    function getAssetsOwned(address _of) 
        external 
        virtual override
        view 
        returns (ContainerLibrary.AssetBalance[] memory) 
    {
        uint256 _elem = assetsOwned[_of].length;
        ContainerLibrary.AssetBalance[] memory assetList = new ContainerLibrary.AssetBalance[](_elem);

        for (uint256 _index = 0; _index < _elem; ++_index) {
            address _asset = assetsOwned[_of][_index];
            assetList[_index].asset = _asset;
            assetList[_index].balance = _getAssetBalance(_asset, _of);
        }
        return assetList;
    }

    function swapAsset(uint256 _amountIn, address _tokenIn, address _tokenOut) 
        external 
        virtual override
        whenNotPaused 
        returns (uint256[] memory amounts) 
    {
        require(_amountIn > 0, "Trading: amountIn is 0");
        require(_tokenIn != address(0), "Trading: tokenIn address is 0");
        require(_tokenOut != address(0), "Trading: tokenOut address is 0");
        require(
            _amountIn <= _getAssetBalance(_tokenIn, msg.sender), 
            "Trading: amount > asset balance"
        );
        amounts = _swap(_amountIn, _tokenIn, _tokenOut, msg.sender);
    }

    function _sellAssetsForEth(ContainerLibrary.Asset[] calldata _assetList, uint256 _sharePercentage, address _to)
        internal
        returns (uint256 _sellingAmount)
    {
        address _tokenIn;
        uint256 _amountIn;

        for (uint256 _index = 0; _index < _assetList.length; ++_index) {
            _tokenIn = _assetList[_index].assetAddress;
            _amountIn = _calculateAmountToSell(
                _getAssetBalance(_tokenIn, msg.sender),
                _sharePercentage
            );      
            _sellingAmount += _sellAssetForEth(_amountIn, _tokenIn, _to);
        }
    }

    function _sellAssetForEth(uint256 _amountIn, address _tokenIn, address _to)
        internal
        returns (uint256)
    {
        if (_amountIn == 0) return 0;

        uint256[] memory _amounts = _swap(
            _amountIn,
            _tokenIn, 
            WETH,
            _to
        );        

        uint256 _amountOut = _amounts[_amounts.length - 1];
        // emit TradeAsset(_tokenIn, _amountIn, WETH, _amountOut);
        return _amountOut;
    }

    function _calculatePath(address _tokenIn, address _tokenOut) internal view returns (address[] memory _path) {
        if (_tokenIn == WETH || _tokenOut == WETH) {
            _path = new address[](2);
            _path[0] = _tokenIn;
            _path[1] = _tokenOut;
        } else {
            _path = new address[](3);
            _path[0] = _tokenIn;
            _path[1] = WETH;
            _path[2] = _tokenOut;
        }           
    }

    function _calculateAmountOut(uint256 _amountIn, address[] memory _path)
        internal
        view
        returns (uint256 _amountOut)
    {
        uint256[] memory _amounts = uniswapV2Router.getAmountsOut(_amountIn, _path);
        _amountOut = _amounts[_amounts.length - 1];
    }

    function _swap(
        uint256 _amountIn,
        address _tokenIn,
        address _tokenOut,
        address _to
    ) 
        internal 
        returns (uint256[] memory amounts)
    {
        address[] memory _path = _calculatePath(_tokenIn, _tokenOut);
        uint256 _amountOutMin = _calculateAmountOut(_amountIn, _path);
        uint256 _deadline = block.timestamp;

        if (_path[0] == WETH) {
            amounts = uniswapV2Router.swapExactETHForTokens{value: _amountIn}(
                _amountOutMin,
                _path,
                _to,
                _deadline
            );
            _addAssetToListOf(msg.sender, _tokenOut);

        } else { 
            IERC20(_tokenIn).transferFrom(msg.sender, address(this), _amountIn);
            IERC20(_tokenIn).approve(address(uniswapV2Router), _amountIn);

            if (_path[_path.length - 1] == WETH) {
                amounts = uniswapV2Router.swapExactTokensForETH(
                    _amountIn,
                    _amountOutMin,
                    _path,
                    _to,
                    _deadline
                );    

            } else {
                amounts = uniswapV2Router.swapExactTokensForTokens(
                    _amountIn,
                    _amountOutMin,
                    _path,
                    _to,
                    _deadline
                );    
                _addAssetToListOf(msg.sender, _tokenOut);
            }   
        }

        emit TradeAsset(_tokenIn, amounts[0], _tokenOut, amounts[amounts.length - 1]);
    }

    function _calculateAmountToBuy(uint256 _amount, uint256 _percentage)
        internal
        pure
        returns (uint256)
    {
        return (_amount * _percentage) / 100;
    }    

    function _calculateAmountToSell(uint256 _amount, uint256 _percentage)
        internal
        pure
        returns (uint256)
    {
        return (_amount * _percentage) / (100 * PRECISION);
    }   

    /**
     * @notice Pause the contract (only allowed to the DEFAULT_ADMIN_ROLE)
     */
    function pause() 
        external 
        virtual override
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        _pause();
    }

    /**
     * @notice Unpause the contract (only allowed to the DEFAULT_ADMIN_ROLE)
     */
    function unpause() 
        external 
        virtual override
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        _unpause();
    }
}