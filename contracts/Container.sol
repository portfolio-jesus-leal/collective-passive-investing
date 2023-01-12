//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ContainerLibrary.sol";
import "./TokenERC20.sol";
import "./ITrading.sol";
import "./IUtils.sol";

/**
 *  @title Container management contract
 *  @author Jesús Leal
 *  @notice It contains the functionality to manage a container.
 *  Only those users who comply with the minimum amount required can participate.
 *  @dev This contract uses a Chainlink Data Feed to get ETH/USD price in order to validate the minimum amount required.
 *  Both the price-feeder address and the minimum amount required can be updated by DEFAULT_ADMIN_ROLE.
 *  In case it would be necessary, DEFAULT_ADMIN_ROLE also can pause this contract.
 */
contract Container is Pausable, AccessControl, ReentrancyGuard {

    // ********************
    // Constants
    // ********************
    /// @notice Value for MANAGER_ROLE
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    /// @notice Maximum value allowed for fields with percentage
    uint256 public constant MAX_FEE_PERCENT = 10;
    /// @notice Maximum percentage value
    uint256 public constant MAX_PERCENTAGE = 100;
    /// @notice Maximum value allowed for minimum amount in USD required
    uint256 public constant MAX_USD_AMOUNT = 10**6;
    /// @notice Decimal precision (as per ETH_DECIMALS)
    uint256 public constant PRECISION = (10**18);

    uint256 public constant MAX_QTY = (10**28);

    uint256 public constant MIN_AMNT_WITHDRAW = (10**10);

    uint256 public constant MAX_RATE = (PRECISION * 10**7);

    // ********************
    // Variables
    // ********************
    /// @dev This variable can be updated with function setMinimumAmountUsd (Only by DEFAULT_ADMIN_ROLE)
    uint256 private minimumAmountUsd = 1000;
    /// @dev Entry fee (Container attributes)
    uint256 private entryFeePct;
    /// @dev Exit fee (Container attributes)
    uint256 private exitFeePct;
    /// @dev Based on initial ETH amount and initial token supply
    uint256 private rateEthToken;
    /// @dev White list of addresses
    mapping(address => bool) private whiteList;

    address private manager;

    bool private isActive;

    ContainerLibrary.Asset[] private assetList;

    mapping (address => uint) private pendingWithdrawals;

    uint256 private amountEthReserved;

    address private tradingAddress;

    // ********************
    // Vars for contracts
    // ********************
    TokenERC20 internal immutable token;
    IUtils internal priceFeed;
    ITrading internal trading;

    // ********************
    // Events
    // ********************
    /**
     * @notice Event ContainerCreated - Emitted with the creation of a new contract
     * @param containerAddress Address Container contract created
     * @param tokenAddress Address ERC20 Token contract created
     * @param factoryOwner Container factory owner
     * @param manager Container creator
     * @param initialInvestment Initial ETH investment
     * @param initialTokenSupply Initial ERC-20 token supply
     */
    event ContainerCreated(
        address indexed containerAddress,
        address indexed tokenAddress,
        address factoryOwner,
        address indexed manager,
        uint256 initialInvestment,
        uint256 initialTokenSupply
    );
    /**
     * @dev Event Deposited - Emitted when an user deposits (sends) Ethers to the container
     * @param from User's address who sent the Ethers
     * @param amountEth Amount of Ethers sent by the user
     * @param amountToken ERC20 tokens assigned to the user (Countervalue of the Ether amount)
     * @param amountFeeToken ERC20 tokens assigned to the manager (Entry fee)
     */
    event Deposited(
        address indexed from,
        uint256 amountEth,
        uint256 amountToken,
        uint256 amountFeeToken
    );
    /**
     * @notice Event Received - Emitted when a amount is received using the function "receive" (fallback)
     * @param from Address from which the amount is received
     * @param amount Amount received
     */
    event Received(address indexed from, uint256 amount);
    /**
     * @notice Event WithdrawalRequested - Emitted when a user requests to withdraw an amount of tokens from the
     * container
     * @param to User's address who sent the request
     * @param amountToken Amount of ERC20 tokens the user requested to withdraw
     * @param amountEth amount of Ethers obtained by the sale of tokens
     */
    event WithdrawalRequested(
        address indexed to,
        uint256 amountToken,
        uint256 amountEth
    );
    /**
     * @notice Event NewPriceFeedAddress - Emitted when the address of the Price Feed contract is updated
     * @param newPriceFeedAddress New address
     */
    event NewPriceFeedAddress(address indexed newPriceFeedAddress);
    /**
     * @notice Event NewMinimumUsdAmount - Emitted when the minimum USD amount required for a deposit is updated
     * @param minimumAmountUsd New minimum USD amount
     */
    event NewMinimumUsdAmount(uint256 minimumAmountUsd);
    /**
     * @notice Event IncludedInWhiteList - Emitted when an address is included in the white list
     * @param addressIn Address included
     */
    event IncludedInWhiteList(address indexed addressIn);

    event AssetListUpdated(ContainerLibrary.Asset[] assetList);

    event AssetListRebalanced(ContainerLibrary.Asset[] assetList);

    event WithdrawalSent(address indexed to, uint amount);

    event ContainerClosed(address indexed requester, uint256 amount);

    // ********************
    // Errors
    // ********************
    error TransferToFailed();
    error NotEnoughFunds();

    /** ***************************************************************************************************
     * @notice Constructor (Container creation)
     * @dev All the parameters included here are necessary for the creation and management of the container.
     * We aware that initialTokenSupply is a reference value used to calculate the rate ETH/ERC-20 token.
     * Hence could be a slight difference between this value and the amount of tokens finally minted.
     * @param _contAttr Container attributes
     * @param _factoryOwner Factory contract owner
     * @param _containerCreator Original sender (The address executing the factory contract)
     * @param _priceFeedAddress Price feed address
     **************************************************************************************************** */
    constructor(
        ContainerLibrary.ContainerAttributes memory _contAttr,
        ContainerLibrary.Asset[] memory _assetList,
        address _factoryOwner,
        address _containerCreator,
        address _priceFeedAddress,
        address payable _tradingContract
    ) 
        payable 
        whenAddressNotEmpty(_factoryOwner)
        whenAddressNotEmpty(_containerCreator)
        whenAddressNotEmpty(_tradingContract)
    {
        require(msg.value > 0, "Container: no ethers sent");

        _validateContainerAttributes(_contAttr);

        manager = _containerCreator;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DEFAULT_ADMIN_ROLE, _factoryOwner);
        _grantRole(MANAGER_ROLE, _factoryOwner);
        _grantRole(MANAGER_ROLE, manager);

        _setPriceFeedAddress(_priceFeedAddress);

        tradingAddress = _tradingContract;
        trading = ITrading(_tradingContract);

        _validateMinimumAmountUsd(msg.value);

        isActive = true;
        minimumAmountUsd = _contAttr.minimumAmountUsd;
        entryFeePct = _contAttr.entryFeePct;
        exitFeePct = _contAttr.exitFeePct;

        rateEthToken = _calculateRateEthToken(
            msg.value,
            _contAttr.initialTokenSupply
        );

        uint256 _realTokenAmount = _calculateAmountToken(
            msg.value,
            rateEthToken
        );

        _setAssetList(_assetList);
        trading.buyAssetList{value: msg.value}(assetList);

        token = new TokenERC20(_contAttr.name, _contAttr.symbol);
        token.mint(_containerCreator, _realTokenAmount);

        emit ContainerCreated(
            address(this),
            address(token),
            _factoryOwner,
            _containerCreator,
            msg.value,
            _realTokenAmount
        );
    }

    /**
     * @notice Fallback function to receive funds
     */
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    function isContainerActive() public view returns (bool) {
        return isActive;
    }

    /**
     * @notice Withdrawal Request - The first step to be able to withdraw the funds is to make a withdrawal request
     * @dev In this first step the request is included in the request list.
     * @param _amountToken Amount of tokens to withdraw
     */
    function withdrawalRequest(uint256 _amountToken) external nonReentrant whenNotPaused returns (uint256) {
        require(_amountToken > MIN_AMNT_WITHDRAW, "Container: amount too low");
        require(
            _amountToken <= token.balanceOf(msg.sender),
            "Container: insufficient balance"
        );
        require(
            _amountToken <= token.allowance(msg.sender, address(this)),
            "Container:insufficient allowance"
        );

        uint256 _netAmount;
        uint256 _feeAmount;
        uint256 _amountEth;

        if (msg.sender == manager && !isActive) {
            _netAmount = _amountToken;
            _feeAmount = 0;
        } else {
            (_netAmount, _feeAmount) = _calculateFee(_amountToken, exitFeePct);
        }

        uint256 _tokenPct = (_netAmount * (100 * PRECISION)) / token.totalSupply();
        
        if (isActive) {
            _amountEth = trading.sellAssetList(assetList, _tokenPct);
        } else {
            _amountEth = (amountEthReserved * _tokenPct) / (100 * PRECISION);
            if (amountEthReserved < _amountEth) revert NotEnoughFunds();
            amountEthReserved -= _amountEth;
        }

        token.transferFrom(msg.sender, manager, _feeAmount);
        token.transferFrom(msg.sender, address(this), _netAmount);
        token.burn(_netAmount);

        pendingWithdrawals[msg.sender] += _amountEth;

        emit WithdrawalRequested(msg.sender, _amountToken, _amountEth);

        return _amountEth;
    }

    /**
     * @notice Function to withdraw the amount of a request
     */
    function withdraw() public payable nonReentrant whenNotPaused {
        require(pendingWithdrawals[msg.sender] > 0, "Container: No amount to withdraw");

        uint256 _amount = pendingWithdrawals[msg.sender];
        pendingWithdrawals[msg.sender] = 0;

        assert(address(this).balance >= _amount);

        (bool success, ) = msg.sender.call{value: _amount}("");
        if (!success) revert TransferToFailed();

        emit WithdrawalSent(msg.sender, _amount);
    }

    function closeContainer() external nonReentrant whenNotPaused onlyRole(MANAGER_ROLE) {
        isActive = false;
        amountEthReserved = trading.sellAssetList(assetList, MAX_PERCENTAGE * PRECISION);

        emit ContainerClosed(msg.sender, amountEthReserved);
    }

    function setAssetList(ContainerLibrary.Asset[] calldata _assetList)
        public
        nonReentrant
        whenNotPaused
        onlyRole(MANAGER_ROLE)
    {
        require(_assetList.length > 0, "Container: Asset list is empty");

        ContainerLibrary.Asset[] memory _prevAssetList = assetList;
        _setAssetList(_assetList);
        uint256 _amountEth = trading.sellAssetList(_prevAssetList, MAX_PERCENTAGE * PRECISION);
        assert(address(this).balance - amountEthReserved >= _amountEth);
        trading.buyAssetList{value: _amountEth}(assetList);

        emit AssetListUpdated(assetList);
    }

    function rebalanceAssetList(ContainerLibrary.Asset[] calldata _assetList)
        public
        nonReentrant
        whenNotPaused
        onlyRole(MANAGER_ROLE)
    {
        require(_assetList.length > 0, "Container: Asset list is empty");
        trading.rebalanceAssetList(_assetList);
        emit AssetListRebalanced(assetList);
    }    

    function _setAssetList(ContainerLibrary.Asset[] memory _assetList) internal {
        require(_assetList.length > 0, "Container: Asset list is empty");

        delete assetList;
        uint256 _totalPct = 0;

        for (uint256 _index = 0; _index < _assetList.length; ++_index) {
            require(
                _assetList[_index].assetAddress != address(0),
                "Container: asset address is 0"
            );
            require(
                _assetList[_index].assetPct > 0,
                "Container: asset pct is 0"
            );
            require(
                _assetList[_index].assetPct <= MAX_PERCENTAGE,
                "Container: asset pct > 100"
            );

            _totalPct += _assetList[_index].assetPct;

            assetList.push(
                ContainerLibrary.Asset({
                    assetAddress: _assetList[_index].assetAddress,
                    assetPct: _assetList[_index].assetPct
                })
            );

            _approveAllowanceTrading(_assetList[_index].assetAddress);
        }
        require(_totalPct == MAX_PERCENTAGE, "Container: total pct is not 100");
    }

    function getAssetList() external view returns (ContainerLibrary.Asset[] memory) {
        return assetList;
    }

    /**
     * @notice Get the amount pending withdrawal for an account
     * @param _to Account address
     * @return The amount pending withdrawal
     */
    function getPendingWithdrawal(address _to)
        external
        view
        returns (uint256)
    {
        return pendingWithdrawals[_to];
    }

    /**
     * @notice Get the address of Price Feed contract
     * @return Price Feed contract address
     */
    function getPriceFeedAddress() external view returns (address) {
        return address(priceFeed);
    }

    /**
     * @notice Get the address of the ERC20 token contract
     * @return ERC20 token contract address
     */
    function getTokenAddress() external view returns (address) {
        return address(token);
    }

    /**
     * @notice Get the balance of the ERC20 token for an account
     * @param _account Account address
     * @return ERC20 token balance
     */
    function getTokenBalance(address _account) external view whenAddressNotEmpty(_account) returns (uint256) {
        return token.balanceOf(_account);
    }    

    function getManager() external view returns (address) {
        return manager;
    }

    /**
     * @notice Get the entry fee percentage
     * @return Entry fee percentage
     */
    function getEntryFee() external view returns (uint256) {
        return entryFeePct;
    }

    /**
     * @notice Get the exit fee percentage
     * @return Exit fee percentage
     */
    function getExitFee() external view returns (uint256) {
        return exitFeePct;
    }

    /**
     * @notice Get the minimum amount in USD required to create a deposit
     * @return Minimum USD amount required
     */
    function getMinimumAmountUsd() external view returns (uint256) {
        return minimumAmountUsd;
    }

    /**
     * @notice Set the minimum amount in USD required to create a deposit (only allowed to the MANAGER_ROLE)
     * @param _minimumAmountUsd New minimum USD amount required
     */
    function setMinimumAmountUsd(uint256 _minimumAmountUsd)
        external
        onlyRole(MANAGER_ROLE)
    {
        require(_minimumAmountUsd > 0, "Container: minimum amount is 0");
        require(
            _minimumAmountUsd < MAX_USD_AMOUNT,
            "Container: min. amount too high"
        );

        minimumAmountUsd = _minimumAmountUsd;
        emit NewMinimumUsdAmount(_minimumAmountUsd);
    }

    /**
     * @notice Get the exchange rate ETH/ERC20 token
     * @return Exchange rate Eth/ERC20 Token
     */
    function getRateEthToken() external view returns (uint256) {
        return rateEthToken;
    }

    /**
     * @notice Get the contract balance (ETH) reserved for withdrawals (only available when the Container 
     * has been closed).
     * @return Contract ETH Balance reserved
     */
    function getContractBalanceReserved() external view returns (uint256) {
        return amountEthReserved;
    }

    function _validateMinimumAmountUsd(uint256 _amountEth) internal {
        uint256 _amountUsd = priceFeed.calculateEthInUsd(_amountEth);
        require(
            _amountUsd >= minimumAmountUsd,
            "Container: min. amount required"
        );
    }

    /**
     * @notice Deposit - An equivalent amount of ERC20 tokens are assigned to the user's address in exchange
     * for their Ethers.
     * @dev This function calculates the equivalent amount in USD to check the minimum amount required.
     * Also calculates the equivalent amount of ERC20 tokens to assign them in return for the amount of Ethers
     * deposited less the entry fee. Those tokens are minted at the time they are assigned.
     */
    function deposit() public payable nonReentrant whenNotPaused whenIsActive {
        _validateMinimumAmountUsd(msg.value);

        uint256 _amountToken = _calculateAmountToken(msg.value, rateEthToken);

        (uint256 _netAmount, uint256 _feeAmount) = _calculateFee(_amountToken, entryFeePct);

        ContainerLibrary.Asset[] memory _assetList = new ContainerLibrary.Asset[](assetList.length + 1);
        _assetList = assetList;

        trading.buyAssetList{value: msg.value}(_assetList);

        token.mint(msg.sender, _netAmount);
        token.mint(manager, _feeAmount);

        emit Deposited(msg.sender, msg.value, _netAmount, _feeAmount);
    }

    /**
     * @notice Set a new address for the Price Feed contract (public function only allowed to DEFAULT_ADMIN_ROLE)
     * @dev Wraps the internal function to make the functionality public
     * @param _priceFeedAddress New address for Price Feed contract
     */
    function setPriceFeedAddress(address _priceFeedAddress)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setPriceFeedAddress(_priceFeedAddress);
        emit NewPriceFeedAddress(_priceFeedAddress);
    }

    /**
     * @notice Set a new address for the Price Feed contract (internal function)
     * @param _priceFeedAddress New address for Price Feed contract
     */
    function _setPriceFeedAddress(address _priceFeedAddress) 
        internal 
        whenAddressNotEmpty(_priceFeedAddress) 
    {
        priceFeed = IUtils(_priceFeedAddress);
    }

    /**
     * @notice Pause the contract (only allowed to the DEFAULT_ADMIN_ROLE)
     */
    function pause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract (only allowed to the DEFAULT_ADMIN_ROLE)
     */
    function unpause() public onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Include an address in the white list
     * @param _addr Address to include
     */
    function includeInWhiteList(address _addr)
        public
        whenAddressNotEmpty(_addr)
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        // require(_addr != address(0), "Container: address is not valid");
        whiteList[_addr] = true;

        emit IncludedInWhiteList(_addr);
    }

    /**
     * @notice Check if an address is included in the white list
     * @param _addr Address to validate
     * @return true if it is included or false if it is not
     */
    function inWhiteList(address _addr) public view returns (bool) {
        return whiteList[_addr];
    }

    /**
     * @notice Given an amount of Ethers, calculate the equivalent amount in ERC20 tokens
     * @param _amountEth ETH amount
     * @param _rate Rate ETH/Token
     * @return Equivalent ERC20 Token amount
     */
    function _calculateAmountToken(uint256 _amountEth, uint256 _rate)
        internal
        pure
        returns (uint256)
    {
        require(_amountEth <= MAX_QTY, "Container: amountEth > MAX_QTY");
        require(_rate <= MAX_RATE, "Container: rate > MAX_RATE");

        return (_amountEth * PRECISION) / _rate;
    }

    // /**
    //  * @notice Given an amount of ERC20 tokens, calculate the equivalent amount in Ethers
    //  * @param _amountToken ERC20 Token amount
    //  * @param _rate Rate ETH/Token
    //  * @return Equivalent ETH amount
    //  */
    // function _calculateAmountEth(uint256 _amountToken, uint256 _rate)
    //     internal
    //     pure
    //     returns (uint256)
    // {
    //     require(_amountToken <= MAX_QTY, "Container: amountToken > MAX_QTY");
    //     require(_rate <= MAX_RATE, "Container: rate > MAX_RATE");

    //     return (_amountToken * _rate) / PRECISION;
    // }

    function _calculateFee(uint256 _amount, uint256 _feePercentage)
        internal
        pure
        returns (uint256 _netAmount, uint256 _feeAmount)
    {
        _feeAmount = _calculateAmountPct(_amount, _feePercentage);
        _netAmount = _amount - _feeAmount;
    }

    function _calculateAmountPct(uint256 _amount, uint256 _percentage)
        internal
        pure
        returns (uint256)
    {
        return (_amount * _percentage) / 100;
    }

    function _calculateRateEthToken(uint256 _amountEth, uint256 _amountToken)
        internal
        pure
        returns (uint256)
    {
        return (_amountEth * PRECISION) / _amountToken;
    }

    /**
     * @notice Basic validation of container attributes
     *
     * @param _containerAttr ContainerAttributes struct with all the attributes of a container
     */
    function _validateContainerAttributes(
        ContainerLibrary.ContainerAttributes memory _containerAttr
    ) internal pure {
        require(
            _containerAttr.initialTokenSupply > 0,
            "Container: amount of tokens is 0"
        );
        require(
            _containerAttr.entryFeePct <= MAX_FEE_PERCENT,
            "Container: entry fee not valid"
        );
        require(
            _containerAttr.exitFeePct <= MAX_FEE_PERCENT,
            "Container: exit fee not valid"
        );
        require(
            _containerAttr.minimumAmountUsd > 0,
            "Container: min USD amount is 0"
        );
        require(
            _containerAttr.minimumAmountUsd < MAX_USD_AMOUNT,
            "Container: min USD amnt too high"
        );
        require(
            bytes(_containerAttr.name).length > 0,
            "Container: token name is empty"
        );
        require(
            bytes(_containerAttr.symbol).length > 0,
            "Container: token symbol is empty"
        );
    }

    function _approveAllowanceTrading(address _token) internal {
        IERC20(_token).approve(tradingAddress, MAX_QTY);
    }

    modifier whenIsActive() {
        require(isActive, "Container: it is not active");
        _;
    }

    modifier whenAddressNotEmpty(address _address) {
        require(_address != address(0), "Container: address is empty");
        _;
    }
}