const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const { MockProvider } = require("ethereum-waffle");
const helpers = require("@nomicfoundation/hardhat-network-helpers");

const provider = waffle.provider;
const toBN = ethers.BigNumber.from;

const PRICE_FEED_ADDRESS = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";
const UNISWAP_ROUTER02 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
const TOKEN_NAME = "My-Token";
const TOKEN_SYMBOL = "MYT";

let priceConsumerV3;
let utils;
let trading;
let token;

const [ACCOUNT_TEST_1, ACCOUNT_TEST_2] = new MockProvider().getWallets();

//
// UNIT TEST - Chainlink data feed contract
//
describe("Test PriceConsumerV3 (Unit test)", function () {

  before(async () => {
    let PriceConsumerV3 = await ethers.getContractFactory("PriceConsumerV3")  
    priceConsumerV3 = await PriceConsumerV3.deploy(PRICE_FEED_ADDRESS)
    await priceConsumerV3.deployed()
  })  

  it("Should be a valid address", async function () {
    let result = await priceConsumerV3.getPriceFeed();  
    expect(result.toUpperCase()).to.equal(PRICE_FEED_ADDRESS.toUpperCase());
  })  

  it("Should be able to successfully get round data", async function () {
    expect(await priceConsumerV3.getLatestPrice()).not.be.null
  })  

  it("Should get decimal places for USD amounts", async function () {
    expect(await priceConsumerV3.decimals()).to.equal(8)
  })  
})  

//
// UNIT TEST - Utils contract
//
describe("Test Utils (Unit test)", function () {

  let owner;
  let other_signer;

  before(async () => {
    [owner, other_signer] = await ethers.getSigners();

    let Utils = await ethers.getContractFactory("Utils");
    utils = await Utils.deploy(priceConsumerV3.address);
    await utils.deployed();
  })  

  it("Should convert an amount of ETH to USD", async function () {
    expect(await utils.calculateEthInUsd(ethers.utils.parseEther("1.0"))).to.be.above(0);
  })  

  it("Should try to set a new Price Feed address and fail due to an address not valid", async function () {
    await expect(utils.setPriceFeedAddress(ACCOUNT_TEST_1.address))
      .to.be.reverted;
  }) 
  
  it("Should fail when a account other than the owner try to set a new Price Feed address", async function () {
    await expect(utils.connect(other_signer).setPriceFeedAddress(ACCOUNT_TEST_1.address))
      .to.be.revertedWith("Ownable: caller is not the owner");
  })  

  it("Should set a new Price Feed address and emit event NewPriceFeedAddress", async function () {
    await expect(utils.setPriceFeedAddress(priceConsumerV3.address))
      .to.emit(utils, 'NewPriceFeedAddress')
      .withArgs(priceConsumerV3.address);
  })  

  it("Should get the new Price Feed address", async function () {
    let result = await utils.getPriceFeedAddress();
    expect(result.toUpperCase()).to.equal(priceConsumerV3.address.toUpperCase());
  })  

  it("Should get decimal places for amounts in USD", async function () {
    expect(await utils.getUsdDecimals()).to.equal(8);
  }) 

  it("Should get the rate ETH/USD", async function () {
    let result = await utils.getRateEthUsd();
    expect(result).to.be.above(0);
  }) 
})

//
// UNIT TEST - Trading contract
//
describe("Test Trading (Unit test)", function () {

  let owner;
  let trader_signer;
  let other_signer;
  let listAssetsOwnedBefore;
  
  before(async () => {
    [ owner, trader_signer, other_signer ] = await ethers.getSigners();

    let Trading = await ethers.getContractFactory("Trading")  
    trading = await Trading.deploy(UNISWAP_ROUTER02)
    await trading.deployed()

    await helpers.setBalance(trading.address, 100n ** 18n);
  })  

  beforeEach(async () => {
    listAssetsOwnedBefore = await trading.getAssetsOwned(trader_signer.address)
  })

  it("Basic checks", async function () {
    await trading.connect(owner).pause();
    expect(await trading.paused()).to.be.true;
    console.log("    A user with DEFAULT_ADMIN_ROLE can pause: ✅");

    await expect(trading.connect(trader_signer).unpause()).to.be.reverted;
    console.log("    A user without DEFAULT_ADMIN_ROLE can not unpause: ✅");

    await trading.connect(owner).unpause();
    expect(await trading.paused()).to.be.false;
    console.log("    A user with DEFAULT_ADMIN_ROLE can unpause: ✅");

    await expect(trading.connect(trader_signer).pause()).to.be.reverted;
    console.log("    A user without DEFAULT_ADMIN_ROLE can not pause: ✅");
  })

  it("Should get some balance from the trading contract", async function () {
    let result = await provider.getBalance(trading.address);
    expect(await provider.getBalance(trading.address)).to.above(0);
  })

  it("Should can transfer some Ethers", async function () {

    let AMOUNT_TRANSFER = ethers.utils.parseEther("1.0")

    let balanceBeforeS = await provider.getBalance(trading.address);
    console.log("    Get the initial balance (sender): ✅");

    let balanceBeforeR = await provider.getBalance(ACCOUNT_TEST_1.address);
    console.log("    Get the initial balance (receiver): ✅");

    await expect(trading.transferTo(ACCOUNT_TEST_1.address, AMOUNT_TRANSFER))
      .to.emit(trading, 'Transfer')
      .withArgs(ACCOUNT_TEST_1.address, AMOUNT_TRANSFER);
    console.log("    Tranfer the amount and emit the event Transfer: ✅");

    let balanceAfterS = await provider.getBalance(trading.address);
    expect(balanceAfterS).to.equal(balanceBeforeS.sub(AMOUNT_TRANSFER));
    console.log("    Check the final balance (sender): ✅");

    let balanceAfterR = await provider.getBalance(ACCOUNT_TEST_1.address);
    expect(balanceAfterR).to.equal(balanceBeforeR.add(AMOUNT_TRANSFER));
    console.log("    Check the final balance (receiver): ✅");
  })

  it("Should buy some assets", async function () {

    const ASSET_LIST = [
      ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 75], // WBTC
      ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", 25], // UNI
    ];

    const INITIAL_INVEST_ETH = ethers.utils.parseEther("10.0")

    await trading.connect(trader_signer).buyAssetList(ASSET_LIST, {value: INITIAL_INVEST_ETH});

    let listAssetsOwned = await trading.getAssetsOwned(trader_signer.address)
    
    for (let index = 0; index < ASSET_LIST.length; index++) {
      let balanceAsset = await trading.getAssetBalance(ASSET_LIST[index][0], trader_signer.address)
      expect(listAssetsOwned[index].asset).to.equal(ASSET_LIST[index][0]);
      console.log("    Check the asset", index + 1, "address: ✅");
      expect(listAssetsOwned[index].balance).to.equal(balanceAsset);
      console.log("    Check the asset", index + 1, "balance: ✅");
    }
  })

  it("Should rebalance the assets", async function () {

    const ASSET_LIST = [
      ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 25], // WBTC
      ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", 75], // UNI
    ];

    // let listAssetsOwnedBefore = await trading.getAssetsOwned(trader_signer.address)

    await expect(trading.connect(trader_signer).rebalanceAssetList(ASSET_LIST))
      .to.be.reverted;
    console.log("    Rebalancing fails due to there are not allowances: ✅");

    for (let index = 0; index < ASSET_LIST.length; index++) {
      let tokenContract = await ethers.getContractAt("TokenERC20", listAssetsOwnedBefore[index].asset);
      tokenContract.connect(trader_signer).approve(trading.address, listAssetsOwnedBefore[index].balance);
      console.log("    Approve allowance", listAssetsOwnedBefore[index].asset, ": ✅");
    }

    let result
    await expect(result = trading.connect(trader_signer).rebalanceAssetList(ASSET_LIST))
      .to.emit(trading, 'TradeAsset')
    console.log("    Rebalanced successfully and event TradeAsset emitted: ✅");

    // result.then(async (ok, error) => {
    //   if (ok) {
    //     // ** Get the transaction receipt to obtain the details
    //     const receipt = await provider.getTransactionReceipt(ok.hash);
    //     console.log("receipt >", receipt)
    //     console.log("receipt.logs.length >", receipt.logs.length)
    //     for (let i = 0; i < receipt.logs.length; i++) {
    //       console.log("receipt.logs[", i, "].topics >", receipt.logs[i].topics)
    //     }
    //   } else {
    //     console.error(error);
    //   }
    // });

    let listAssetsOwnedAfter = await trading.getAssetsOwned(trader_signer.address)
    expect(listAssetsOwnedAfter[0].balance).to.below(listAssetsOwnedBefore[0].balance)
    console.log("    Balance asset", listAssetsOwnedAfter[0].asset, "has decreased: ✅");
    expect(listAssetsOwnedAfter[1].balance).to.above(listAssetsOwnedBefore[1].balance)
    console.log("    Balance asset", listAssetsOwnedAfter[1].asset, "has incremented: ✅");
  })

  it("Should swap an asset pair", async function () {

    const ASSET_LIST = [
      ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 25], // WBTC
      ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", 75], // UNI
    ];

    let amountIn = listAssetsOwnedBefore[1].balance.div(toBN(2));

    await expect(trading.connect(other_signer).swapAsset(
      amountIn,
      ASSET_LIST[1][0],
      ASSET_LIST[0][0]
    )).to.be.revertedWith("Trading: amount > asset balance");
    console.log("    Swap fail due to insufficient balance (other_signer): ✅");

    await expect(trading.connect(trader_signer).swapAsset(
      amountIn,
      ASSET_LIST[1][0],
      ASSET_LIST[0][0]
    )).to.be.revertedWith("Uni::transferFrom: transfer amount exceeds spender allowance");
    console.log("    Swap fail due to amount exceeding spender allowance (trader_signer): ✅");

    let tokenContract = await ethers.getContractAt("TokenERC20", ASSET_LIST[1][0]);
    tokenContract.connect(trader_signer).approve(trading.address, amountIn);
    console.log("    Approve allowance", ASSET_LIST[1][0], ": ✅");

    let result;
    await expect(result = trading.connect(trader_signer).swapAsset(
      amountIn,
      ASSET_LIST[1][0],
      ASSET_LIST[0][0]
    )).to.emit(trading, 'TradeAsset')
    console.log("    Swapped assets successfully and event TradeAsset emitted: ✅");

    // result.then(async (ok, error) => {
    //   if (ok) {
    //     // ** Get the transaction receipt to obtain the details
    //     const receipt = await provider.getTransactionReceipt(ok.hash);
    //     console.log("receipt >", receipt)
    //     console.log("receipt.logs.length >", receipt.logs.length)
    //     for (let i = 0; i < receipt.logs.length; i++) {
    //       console.log("receipt.logs[", i, "].topics >", receipt.logs[i].topics)
    //     }
    //   } else {
    //     console.error(error);
    //   }
    // });

    let listAssetsOwnedAfter = await trading.getAssetsOwned(trader_signer.address)

    expect(listAssetsOwnedAfter[1].balance).to.below(listAssetsOwnedBefore[1].balance)
    console.log("    Balance asset", listAssetsOwnedAfter[1].asset, "has decreased: ✅");
    expect(listAssetsOwnedAfter[0].balance).to.above(listAssetsOwnedBefore[0].balance)
    console.log("    Balance asset", listAssetsOwnedAfter[0].asset, "has incremented: ✅");
  })

  it("Should sell assets", async function () {

    const ASSET_LIST = [
      ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 25], // WBTC
      ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", 75], // UNI
    ];

    await expect(trading.connect(owner).sellAssetList(ASSET_LIST, 100))
      .to.be.revertedWith("AccessControl: account 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 is missing role 0xfacaf2747a7486cf5730e9265973fb54447d3ace6e7e4711f6360826b0731941");
    console.log("    Sale fail due to owner not having a TRADER role: ✅");

    await expect(trading.connect(trader_signer).sellAssetList(ASSET_LIST, ethers.utils.parseUnits("100", 18))).
      to.be.reverted;
    //  to.be.revertedWith("Uni::transferFrom: transfer amount exceeds spender allowance");
    console.log("    Sale fail due to amount exceeding spender allowance: ✅");

    for (let index = 0; index < ASSET_LIST.length; index++) {
      let tokenContract = await ethers.getContractAt("TokenERC20", listAssetsOwnedBefore[index].asset);
      tokenContract.connect(trader_signer).approve(trading.address, listAssetsOwnedBefore[index].balance);
      console.log("    Approve allowance", listAssetsOwnedBefore[index].asset, ": ✅");
    }

    await expect(trading.connect(trader_signer).sellAssetList(ASSET_LIST, ethers.utils.parseUnits("120", 18)))
      .to.be.revertedWith("Trading: Share percentage > 100");
    console.log("    Sale fail due to a share percentage greater than 100%: ✅");

    let result;
    await expect(result = trading.connect(trader_signer).sellAssetList(ASSET_LIST, ethers.utils.parseUnits("100", 18)))
      .to.emit(trading, 'TradeAsset')
    console.log("    Assets sold successfully and event TradeAsset emitted: ✅");

    let listAssetsOwnedAfter = await trading.getAssetsOwned(trader_signer.address);

    for (let index = 0; index < ASSET_LIST.length; index++) {
      expect(listAssetsOwnedAfter[index].balance).to.equal(0)
      console.log("    Balance asset", listAssetsOwnedAfter[index].asset, "is zero: ✅");
    }
  })
})

//
// UNIT TEST - ContainerFactory contract
//
describe("Test ContainerFactory (Unit test)", function () {

  let owner;
  let other_signer;
  let containerFactory;  
  
  before(async () => {
    [ owner, other_signer ] = await ethers.getSigners();

    let ContainerFactory = await ethers.getContractFactory("ContainerFactory")  
    containerFactory = await ContainerFactory.deploy(utils.address, trading.address)
    await containerFactory.deployed()
  })  

  it("Should fail when a account other than the owner try to update the data feed contract address", async function () {
    await expect(containerFactory.connect(other_signer).setPriceFeedAddress(ACCOUNT_TEST_1.address))
      .to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Should update the data feed contract address", async function () {
    await expect(containerFactory.setPriceFeedAddress(ACCOUNT_TEST_1.address))
      .to.emit(containerFactory, 'NewPriceFeedAddress')
      .withArgs(ACCOUNT_TEST_1.address);
  });

  it("Should get the data feed contract address updated", async function () {
    expect(await containerFactory.getPriceFeedAddress()).to.equal(ACCOUNT_TEST_1.address);
  });

  it("Should fail when a account other than the owner try to update the trading contract address", async function () {
    await expect(containerFactory.connect(other_signer).setTradingAddress(ACCOUNT_TEST_1.address))
      .to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Should update the trading contract address", async function () {
    await expect(containerFactory.setTradingAddress(ACCOUNT_TEST_1.address))
      .to.emit(containerFactory, 'NewTradingAddress')
      .withArgs(ACCOUNT_TEST_1.address);
  });

  it("Should get the trading contract address updated", async function () {
    expect(await containerFactory.getTradingAddress()).to.equal(ACCOUNT_TEST_1.address);
  });
})  

//
// UNIT TEST - Container contract
//
describe("Test Container (Unit test)", function () {

  let priceConsumerV3;
  let container;
  let owner;
  let other_signer;

  const AMOUNT_TOKEN = ethers.utils.parseUnits("1000", 18);
  const AMOUNT_ETH = ethers.utils.parseEther("2.0");
  const ENTRY_FEE = 10;
  const EXIT_FEE = 10;
  const MIN_AMOUNT_USD = 1200;

  // const PRICE_FEED_ADDRESS = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";
  // const UNISWAP_ROUTER02 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

  const ASSET_LIST = [
    ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 75], // WBTC
    ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", 25], // UNI
  ];

  before(async () => {
    [ owner, manager, other_signer ] = await ethers.getSigners();

    let PriceConsumerV3 = await ethers.getContractFactory("PriceConsumerV3")  
    priceConsumerV3 = await PriceConsumerV3.deploy(PRICE_FEED_ADDRESS)
    await priceConsumerV3.deployed()

    const Container = await ethers.getContractFactory("Container");
    container = await Container.deploy(
      [
        AMOUNT_TOKEN,
        ENTRY_FEE, 
        EXIT_FEE, 
        MIN_AMOUNT_USD, 
        TOKEN_NAME, 
        TOKEN_SYMBOL
      ], 
      ASSET_LIST,
      owner.address, 
      manager.address, 
      utils.address,
      trading.address,
      {value:AMOUNT_ETH}
    );
    await container.deployed();
  })

  it("Basic checks", async function () {
    expect(await container.getPriceFeedAddress()).to.equal(utils.address);
    console.log("    Price feed contract address: ✅");
    expect(await container.getMinimumAmountUsd()).to.equal(MIN_AMOUNT_USD);
    console.log("    Minimum amount required in USD: ✅");
    expect(await container.paused()).to.be.false;
    console.log("    The contract is unpaused: ✅");
  });
  
  it("Should update the data feed contract address", async function () {
    await container.setPriceFeedAddress(ACCOUNT_TEST_2.address);
    expect(await container.getPriceFeedAddress()).to.equal(ACCOUNT_TEST_2.address);
  });
  
  it("Should update the USD minimum amount (2000)", async function () {
    await container.setMinimumAmountUsd(2000);
    expect(await container.getMinimumAmountUsd()).to.equal(2000);
  });
  
  it("Should revert when updating the USD minimum amount (amount too high)", async function () {
    await expect(container.setMinimumAmountUsd(2000000)).to.be.reverted;
  });

  it("Should revert when updating the USD minimum amount (not allowed)", async function () {
    await expect(container.connect(other_signer).setMinimumAmountUsd(MIN_AMOUNT_USD)).to.be.reverted;
  });

  it("Should pause the contract", async function () {
    await container.pause();
    expect(await container.paused()).to.be.true;
  });

  it("Should unpause the contract", async function () {
    await container.unpause();
    expect(await container.paused()).to.be.false;
  });  

  it("Should include a address in the white list", async function () {
    await container.includeInWhiteList(ACCOUNT_TEST_1.address);
    expect(await container.inWhiteList(ACCOUNT_TEST_1.address)).to.be.true;
  }); 
});

//
// UNIT TEST - ERC-20 token contract
//
describe("Test TokenERC20 (Unit test)", function () {

  let owner;
  let other_signer;

  before(async () => {
    [ owner, other_signer ] = await ethers.getSigners();

    const TokenERC20 = await ethers.getContractFactory("TokenERC20");
    token = await TokenERC20.deploy("My-Token", "MYT");
    await token.deployed();
  })

  it("Basic checks", async function () {

    let amountToken = "0.5";

    expect(await token.name()).to.equal("My-Token");
    console.log("    Check token name: ✅");
    
    expect(await token.symbol()).to.equal("MYT");
    console.log("    Check token symbol: ✅");
    
    expect(await token.balanceOf(owner.address)).to.equal(0);
    console.log("    Initial balance is 0: ✅");
    
    expect(await token.totalSupply()).to.equal(0);
    console.log("    Total supply is 0: ✅");
    
    expect(await token.owner()).to.equal(owner.address);
    console.log("    Owner is", owner.address, ": ✅");
    
    expect(await token.paused()).to.be.false;
    console.log("    The contract is unpaused: ✅");
    
    expect(await token.mint(owner.address, ethers.utils.parseUnits(amountToken, 18)))
      .to.emit(token, 'Transfer')
      .withArgs(ADDRESS_ZERO, owner.address, ethers.utils.parseUnits(amountToken, 18));
    console.log("    The owner can mint: ✅");
    
    expect(await token.totalSupply()).to.equal(ethers.utils.parseUnits(amountToken, 18));
    console.log("    Total supply is updated: ✅");
    
    await expect(token.connect(other_signer).mint(owner.address, ethers.utils.parseUnits(amountToken, 18))).to.be.reverted;
    console.log("    A user other than the owner can not mint: ✅");

    await token.pause();
    expect(await token.paused()).to.be.true;
    console.log("    The owner can pause: ✅");

    await expect(token.connect(other_signer).unpause()).to.be.reverted;
    console.log("    A user other than the owner can not unpause: ✅");

    await token.unpause();
    expect(await token.paused()).to.be.false;
    console.log("    The owner can unpause: ✅");

    await expect(token.connect(other_signer).pause()).to.be.reverted;
    console.log("    A user other than the owner can not pause: ✅");
  });

});