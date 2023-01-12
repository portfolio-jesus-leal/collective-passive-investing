//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ContainerLibrary.sol";
import "./Container.sol";

/**
 *  @title Container Factory
 *  @author Jesús Leal
 *  @notice This contract is used to create new containers
 */
contract ContainerFactory is Ownable {

    // ********************
    // Variables
    // ********************
    /// @dev List of containers created by the factory
    mapping(address => bool) private containersCreated;
    /// @dev Price feed address used in the creation of a new container
    address private priceFeedAddress;
    /// @dev Trading contract address used in the creation of a new container
    address private tradingAddress;

    // ********************
    // Events
    // ********************
    /**
     * @notice Event NewContainer - Emitted when a new container is created by the factory
     * @param container Address of new container created
     * @param creator Address of transaction sender
     * @param amount Eth amount sent
     */
    event NewContainer(address indexed container, address indexed creator, uint256 amount);
    /**
     * @notice Event NewPriceFeedAddress - Emitted when the address of the Price Feed contract is updated
     * @param newPriceFeedAddress New address
     */
    event NewPriceFeedAddress(address indexed newPriceFeedAddress);
    /**
     * @notice Event NewTradingAddress - Emitted when the address of the Trading contract is updated
     * @param newTradingAddress New address
     */
    event NewTradingAddress(address indexed newTradingAddress);    

    /** ********************************************************************************************************
     * @notice Constructor
     * @dev Prepare the Chainlink data feed to get the price ETH/USD
     * @param _priceFeedAddress PriceConsumerV3 contract address
     *********************************************************************************************************** */
    constructor(
        address _priceFeedAddress, 
        address _tradingAddress
    ) {
        _setPriceFeedAddress(_priceFeedAddress);
        _setTradingAddress(_tradingAddress);
    }

    /**
     * @notice Creatation of new containers
     * @dev All the parameters included here are necessary for the creation and management of a container
     * The ContainerAttributes struct is defined in ContainerLibrary.sol
     * @param _contAttr New container attributes
     */
    function createContainer(
        ContainerLibrary.ContainerAttributes memory _contAttr,
        ContainerLibrary.Asset[] memory _assetList
    ) public payable returns (address) {

        Container _container = new Container{value: msg.value}(
            _contAttr,
            _assetList,
            owner(),
            msg.sender,
            priceFeedAddress,
            payable(tradingAddress)
        );

        address _newAddress = address(_container);

        containersCreated[_newAddress] = true;
        emit NewContainer(_newAddress, msg.sender, msg.value);

        return _newAddress;
    }

    /**
     * @notice Set a new address for the Price Feed contract (public function only allowed to the owner)
     * @dev Wraps the internal function to make the functionality public
     * @param _priceFeedAddress New address for Price Feed contract
     */
    function setPriceFeedAddress(address _priceFeedAddress) external onlyOwner {
        _setPriceFeedAddress(_priceFeedAddress);
        emit NewPriceFeedAddress(_priceFeedAddress);
    }

    /**
     * @notice Set a new address for the Trading contract (public function only allowed to the owner)
     * @dev Wraps the internal function to make the functionality public
     * @param _tradingAddress New address for Trading contract
     */
    function setTradingAddress(address _tradingAddress) external onlyOwner {
        _setTradingAddress(_tradingAddress);
        emit NewTradingAddress(_tradingAddress);
    }    

    /**
     * @notice Set a new address for the Price Feed contract (internal function)
     * @param _priceFeedAddress New address for Price Feed contract
     */
    function _setPriceFeedAddress(address _priceFeedAddress) internal {
        require(
            _priceFeedAddress != address(0),
            "Factory: price feed address is 0"
        );
        priceFeedAddress = _priceFeedAddress;
    }

    /**
     * @notice Set a new address for the Trading contract (internal function)
     * @param _tradingAddress New address for Trading contract
     */
    function _setTradingAddress(address _tradingAddress) internal {
        require(
            _tradingAddress != address(0),
            "Factory: trading address is 0"
        );
        tradingAddress = _tradingAddress;
    }    

    /**
     * @notice Get the address of Price Feed contract
     * @return Price Feed contract address
     */
    function getPriceFeedAddress() public view returns (address) {
        return priceFeedAddress;
    }

    /**
     * @notice Get the address of Trading contract
     * @return Trading contract address
     */
    function getTradingAddress() public view returns (address) {
        return tradingAddress;
    }    

    /**
     * @notice This function let to check if the container has been created by the factory
     * @param _addressContainer Container address
     * @return True if the container is included in containersCreated list
     */
    function isFactoryCreated(address _addressContainer)
        public
        view
        returns (bool)
    {
        return containersCreated[_addressContainer];
    }
}
