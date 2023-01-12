const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const { formatUnits, numberFormatUnits } = require("./utils/custom_functions");

const provider = waffle.provider;
const toBN = ethers.BigNumber.from;

const PRICE_FEED_ADDRESS = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";
const UNISWAP_ROUTER02 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const TOKEN_NAME = "My-Token";
const TOKEN_SYMBOL = "MYT";

const MARGIN_NUM = 0.0000000001;
const MARGIN_CHAR = ethers.utils.parseUnits("0.0000000001", 18); // BigNumber { value: "100000000" }
const PRECISION = "1000000000000000000"
const MIN_AMNT_WITHDRAW = "10000000001"

//
// INTEGRATION TEST - ContainerFactory + Container + PriceConsumerV3 + ERC-20 token contract + Trading
//
describe("Integration test", function () {

    let factory;
    let priceConsumerV3;
    let utils;
    let container;
    let token;
    let trading;
    let owner;
    let user1;
    let investor;
    let manager;
    let newContainerAddress;
    let tokenContractAddress;
    let assets;
    let assetList;
    let assetList2;
    let assetList3;
    // let assetsBalanceTotal1 = [];
    // let assetsBalanceTotal2 = [];
    let assetsBalanceContainer = [];
    let hash = "";

    let entryFee;
    let exitFee;

    // ** Initial values
    let INITIAL_TOKEN_SUPPLY = ethers.utils.parseUnits("3000", 18);
    let INITIAL_INVEST_ETH = ethers.utils.parseEther("2.0");
    let ENTRY_FEE_PCT = 10; // 10%
    let EXIT_FEE_PCT = 8; // 8%
    let MIN_AMOUNT_USD = 1234;
    
    const ACCOUNT_TEST_1 = "0x62Fc40F1456f82B3e4f3C69B7BFb596D762b9a0f"

    before( async () => {
      [owner, user1, investor, manager] = await ethers.getSigners();

      // ** Deploy PriceConsumerV3
      const PriceConsumerV3 = await ethers.getContractFactory("PriceConsumerV3");
      priceConsumerV3 = await PriceConsumerV3.deploy(PRICE_FEED_ADDRESS);
      await priceConsumerV3.deployed();

      // ** Deploy Utils
      const Utils = await ethers.getContractFactory("Utils");
      utils = await Utils.deploy(priceConsumerV3.address);
      await utils.deployed();

      // ** Deploy Trading
      const Trading = await ethers.getContractFactory("Trading");
      trading = await Trading.deploy(UNISWAP_ROUTER02);
      await trading.deployed();

      // ** Deploy ContainerFactory
      const Factory = await ethers.getContractFactory("ContainerFactory");
      factory = await Factory.deploy(utils.address, trading.address);
      await factory.deployed();

      // ** Define list of assets to buy and sell
      assets = [
        {
            symbol: "WBTC",
            decimals: 8,
            address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 
            percentage: 45
        },
        {
            symbol: "HEX",
            decimals: 8,                
            address: "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39", 
            percentage: 10
        },
        {
            symbol: "FTM",
            decimals: 18,                
            address: "0x4E15361FD6b4BB609Fa63C81A2be19d873717870", 
            percentage: 25
        },
        {
          symbol: "UNI",
          decimals: 18,                
          address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", 
          percentage: 10
        },
        {
          symbol: "DAI",
          decimals: 18,                
          address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", 
          percentage: 10
        }        
      ]

      assetList = [];
      assets.forEach( asset => assetList.push([asset.address, asset.percentage]));
    })

    it("Should be able to successfully get a price from priceConsumerV3", async function () {
      let result = await priceConsumerV3.getLatestPrice(); 
      expect(result).not.be.null;
      console.log("    Price feed is available: ✅");

      result = await utils.calculateEthInUsd(ethers.utils.parseEther("1.0"));
      expect(result).to.be.above(0);
      console.log("    Check 1 ETH is equivalent to", formatUnits(result, 0), "USD : ✅");
    }) 

    it("Should be able to successfully get balance from factory", async function () {
      expect(await factory.getTradingAddress()).to.equal(trading.address);
      console.log("    Container factory is available: ✅");

      expect(await provider.getBalance(factory.address)).to.equal(0);
      console.log("    Container factory balance is 0 ETH: ✅");
    }) 
    
    it("Should creates a new container an emit a event NewContainer", async function () {
      // ** Initial values
      INITIAL_TOKEN_SUPPLY = ethers.utils.parseUnits("5000", 18);
      INITIAL_INVEST_ETH = ethers.utils.parseEther("2.5");
      ENTRY_FEE_PCT = 10; // 10%
      EXIT_FEE_PCT = 10; // 10%
      MIN_AMOUNT_USD = 1200;

      let newContainer;

      await expect(newContainer = factory.createContainer(
        [
          INITIAL_TOKEN_SUPPLY, 
          ENTRY_FEE_PCT, 
          EXIT_FEE_PCT, 
          MIN_AMOUNT_USD, 
          TOKEN_NAME, 
          TOKEN_SYMBOL
        ], 
        assetList,
          {value: INITIAL_INVEST_ETH}
      )).to.emit(factory, 'NewContainer');

      newContainer.then((result, reject) => {
        if (result) {
          hash = result.hash;
        } else {
          console.error(reject);
        }
      });
    })
    
    it("Should validate balances associated with the container created", async function () {

      // ** Get the transaction receipt to obtain the details
      const receipt = await provider.getTransactionReceipt(hash);
  
      // ** Get the address of the new container
      newContainerAddress = receipt.logs[0].address;
      expect(ethers.utils.isAddress(newContainerAddress)).to.be.true;
      console.log("    Container created properly: ✅");

      container = await ethers.getContractAt("Container", newContainerAddress);

      expect(await provider.getBalance(container.address)).to.equal(0);
      //expect(await container.getContractBalance()).to.equal(0);
      console.log("    Check Container balance is 0 ETH : ✅");
      
      tokenContractAddress = await container.getTokenAddress();
      expect(ethers.utils.isAddress(tokenContractAddress)).to.be.true;
      console.log("    Get the ERC-20 token contract address : ✅");
      
      token = await ethers.getContractAt("TokenERC20", tokenContractAddress);

      const managerBalance = await token.balanceOf(owner.address);
      expect(managerBalance).to.above(0);
      console.log("    Get manager balance in ERC-20 tokens (", formatUnits(managerBalance), "): ✅");
      
      const totalSupply = await token.totalSupply();
      expect(totalSupply).to.above(0);
      console.log("    Get ERC-20 token total supply (", formatUnits(totalSupply), "): ✅");

      /* Checking the balance of assets in its contracts and in trading contract. */
      // ** Save asset balances at this point (after creating the first container and before creating a new one)
      for (let index = 0; index < assets.length; index++) {
        // This is the asset balance of the Trading contract (for all the containers)
        // let tokenContract = await ethers.getContractAt("TokenERC20", assets[index].address);
        // let balance = await tokenContract.balanceOf(trading.address);
        // expect(balance).to.equal(0);
        // console.log("    Check total balance in Trading is zero for", await tokenContract.symbol(), ": ✅");

        let assetBalance = await trading.getAssetBalance(assets[index].address, newContainerAddress);
        expect(assetBalance).to.above(0);
        console.log("    Check container balance in Trading ", formatUnits(assetBalance, assets[index].decimals), assets[index].symbol,": ✅");  
      }
    });

    //
    // Create a new container (using ContainerFactory)
    //
    it("Should creates a new container", async function () {

      // ** Initial values
      INITIAL_TOKEN_SUPPLY = ethers.utils.parseUnits("3000", 18);
      INITIAL_INVEST_ETH = ethers.utils.parseEther("2.0");
      ENTRY_FEE_PCT = 10; // 10%
      EXIT_FEE_PCT = 8; // 8%
      MIN_AMOUNT_USD = 1234;
      
      // ** Create a new container using ContainerFactory
      const newContainer = await factory.connect(manager).createContainer(
        [ 
          INITIAL_TOKEN_SUPPLY, 
          ENTRY_FEE_PCT, 
          EXIT_FEE_PCT, 
          MIN_AMOUNT_USD, 
          TOKEN_NAME, 
          TOKEN_SYMBOL
        ], 
        assetList,        
          {value: INITIAL_INVEST_ETH}
      )

      // ** Get the transaction receipt to obtain the details
      const receipt = await provider.getTransactionReceipt(newContainer.hash);

      // ** Get the address of the new container
      newContainerAddress = receipt.logs[0].address;
      expect(ethers.utils.isAddress(newContainerAddress)).to.be.true;
      console.log("    Container created properly: ✅");
      
      expect(await factory.isFactoryCreated(newContainerAddress)).to.be.true;
      console.log("    Check the Container created is a valid container : ✅");

      expect(await factory.isFactoryCreated(ACCOUNT_TEST_1)).to.be.false;
      console.log("    Check other address is not a valid container : ✅");

      //expect(await factory.getContractBalance()).to.equal(0);
      expect(await provider.getBalance(factory.address)).to.equal(0);
      console.log("    Check Container Factory balance is 0 ETH : ✅");
    });      

    //
    // Connect to the new container
    //
    it("Should connect to the new container and check that it is set correctly", async function () {    
      
      const USD_DECIMALS = 8;

      // Calculate the ETH/ERC-20 rate to compare it with the value got from the container
      const rateEthTokenCalculated = Number(INITIAL_INVEST_ETH) / Number(INITIAL_TOKEN_SUPPLY);  

      const Container = await ethers.getContractFactory("Container");
      container = Container.attach(newContainerAddress);

      expect(await provider.getBalance(container.address)).to.equal(0);
      // expect(await container.getContractBalance()).to.equal(0);
      console.log("    Check Container balance is 0 ETH: ✅");

      let utilAddress = await container.getPriceFeedAddress();
      expect(utilAddress).to.equal(utils.address);
      console.log("    Check Price feed address is correct: ✅");

      entryFee = await container.getEntryFee();
      expect(entryFee).to.equal(ENTRY_FEE_PCT);
      console.log("    Check entry fee value is correct (", Number(entryFee), "): ✅");

      exitFee = await container.getExitFee();
      expect(exitFee).to.equal(EXIT_FEE_PCT);
      console.log("    Check exit fee value is correct (", Number(exitFee), "): ✅");

      let minimumAmountUsd = await container.getMinimumAmountUsd();
      expect(minimumAmountUsd).to.equal(MIN_AMOUNT_USD);
      console.log("    Check minimum USD amount required is correct (", Number(minimumAmountUsd), "): ✅");

      let contract = await ethers.getContractAt("Utils", utilAddress);
      let usdDecimals = await contract.getUsdDecimals();
      expect(usdDecimals).to.equal(USD_DECIMALS);
      console.log("    Check USD decimal places (", Number(usdDecimals), "): ✅");

      expect(await container.getManager()).to.equal(manager.address);
      console.log("    Check the manager's address is correct: ✅");

      // * Get the ETH/USD rate
      const rateEthUsd = await utils.getRateEthUsd();
      const rateEthUsdNumber = numberFormatUnits(rateEthUsd, usdDecimals);
      // expect(rateEthUsdNumber).to.be.above(500);
      // expect(rateEthUsdNumber).to.be.below(3000);
      expect(rateEthUsdNumber).to.be.within(500, 3000);
      console.log("    Check rate ETH/USD is not zero (", formatUnits(rateEthUsd), "): ✅");

      // * Get the ETH/ERC-20 token rate
      // The "toFixed" method could round the last decimal. Hence the use of "slice"
      const rateEthToken = await container.getRateEthToken();
      const rateEthTokenNumber = numberFormatUnits(rateEthToken, 18);
      expect(rateEthTokenNumber.toFixed(19).slice(0,-1)).to.equal(rateEthTokenCalculated.toFixed(19).slice(0,-1));
      console.log("    Check rate ETH/ERC-20 token (", rateEthTokenNumber.toFixed(19).slice(0,-1), "): ✅");

      tokenContractAddress = await container.getTokenAddress();
      expect(ethers.utils.isAddress(tokenContractAddress)).to.be.true;
      console.log("    Get the ERC-20 token contract address : ✅");
    });      

    //
    // Connect to the ERC-20 token contract
    //
    it("Should connect to the ERC-20 token contract and check that it is set correctly", async function () {   

      token = await ethers.getContractAt("TokenERC20", tokenContractAddress);

      // At this point (before any deposit), the ERC-20 token total supply corresponds to the tokens owned by the manager
      const balanceTokenManager = await token.balanceOf(manager.address);
      expect(balanceTokenManager).to.above(toBN(INITIAL_TOKEN_SUPPLY).sub(toBN(Number(MARGIN_CHAR))));
      expect(balanceTokenManager).to.below(toBN(INITIAL_TOKEN_SUPPLY).add(toBN(Number(MARGIN_CHAR))));
      console.log("    Check manager balance in ERC-20 tokens (", formatUnits(balanceTokenManager), "): ✅");

      const totalSupply = await token.totalSupply();
      expect(totalSupply).to.equal(balanceTokenManager);
      console.log("    Check ERC-20 token total supply (", formatUnits(totalSupply), "): ✅");
    });

    //
    // Check asset list (set at the new container creation)
    //
    it("Should validate that values of the asset list are as expected", async function () {

        const fullAssetList = await container.getAssetList();

        for (let index = 0; index < assetList.length; index++) {
            expect(fullAssetList[index].assetAddress).to.equal(assets[index].address);
            console.log("    Check asset list -", assets[index].symbol, "address at #", index, ": ✅");

            expect(fullAssetList[index].assetPct).to.equal(assets[index].percentage);
            console.log("    Check asset list -", assets[index].symbol, "percentage at #", index, ": ✅");
        }
    });

    //
    // New deposit in a container
    //
    it("Should deposit funds in an existing container", async function () {
      
      const DEPOSIT_AMOUNT = "8.5";
      const DEPOSIT_SMALL_AMOUNT = "0.02";

      const investorBalanceBefore = await token.balanceOf(investor.address);
      expect(Number(investorBalanceBefore)).to.equal(0);
      console.log("    Get investor balance in ERC-20 tokens (", formatUnits(investorBalanceBefore), "): ✅");
      
      const managerBalanceBefore = await token.balanceOf(manager.address);
      const managerBalanceBeforeNumber = numberFormatUnits(managerBalanceBefore);
      expect(Number(managerBalanceBefore)).to.above(0);
      console.log("    Get manager balance in ERC-20 tokens (", formatUnits(managerBalanceBefore), "): ✅");
      
      const totalSupplyBefore = await token.totalSupply();
      expect(Number(totalSupplyBefore)).to.above(0);
      console.log("    Get ERC-20 token total supply (", formatUnits(totalSupplyBefore), "): ✅");

      const containerBalanceEthBefore = await provider.getBalance(container.address);
      // const containerBalanceEthBefore = await container.getContractBalance();
      expect(Number(containerBalanceEthBefore)).to.equal(0);
      console.log("    Get container balance (0 ETH): ✅");

      const rateEthToken = await container.getRateEthToken();
      const rateEthTokenNumber = numberFormatUnits(rateEthToken);
      expect(Number(rateEthToken)).to.above(0);
      console.log("    Get rate ETH/ERC-20 token (", formatUnits(rateEthToken), "): ✅");

      await expect(container.connect(investor).deposit({value:ethers.utils.parseEther(DEPOSIT_SMALL_AMOUNT)}))
        .to.be.revertedWith('Container: min. amount required');
      // .to.be.reverted;
      console.log("    Deposits of small amounts are reverted: ✅");
      
      expect(await container.connect(investor).deposit({value:ethers.utils.parseEther(DEPOSIT_AMOUNT)}))
        .to.emit(container, 'Deposited');
      console.log("    Event Deposited is emitted on the creation of a deposit: ✅");
      
      // const containerBalanceEthAfter = await container.getContractBalance();
      const containerBalanceEthAfter = await provider.getBalance(container.address);

      expect(containerBalanceEthAfter).to.equal(containerBalanceEthBefore);
      console.log("    Check container balance (ETH) does not change: ✅");

      // Calculate amount of tokens to receive for the deposit
      const newTokens = Number(DEPOSIT_AMOUNT) / rateEthTokenNumber;
      const amountNewTokens = (newTokens * (100 - entryFee)) / 100;
      const amountNewTokensFee = newTokens - amountNewTokens;

      const investorBalanceAfter = await token.balanceOf(investor.address);
      const investorBalanceAfterNumber = numberFormatUnits(investorBalanceAfter);
      expect(investorBalanceAfterNumber).to.above(amountNewTokens - MARGIN_NUM);
      expect(investorBalanceAfterNumber).to.below(amountNewTokens + MARGIN_NUM);
      console.log("    Check investor balance in ERC-20 tokens (", formatUnits(investorBalanceAfter), "): ✅");

      const managerBalanceAfter = await token.balanceOf(manager.address);
      const managerBalanceAfterNumber = numberFormatUnits(managerBalanceAfter);
      const amountTokensFee = toBN(managerBalanceAfter).sub(toBN(managerBalanceBefore))
 
      expect(managerBalanceAfterNumber).to.above(managerBalanceBeforeNumber + amountNewTokensFee - MARGIN_NUM);
      expect(managerBalanceAfterNumber).to.below(managerBalanceBeforeNumber + amountNewTokensFee + MARGIN_NUM);
      console.log("    Check manager balance in ERC-20 tokens (", formatUnits(managerBalanceAfter), "): ✅");

      /* Checking the total supply of the token after the transaction. */
      const totalSupplyAfter = await token.totalSupply();
      const newSupply = toBN(totalSupplyBefore).add(toBN(investorBalanceAfter)).add(amountTokensFee)

      expect(totalSupplyAfter).to.equal(newSupply);
      console.log("    Check ERC-20 token total supply (", formatUnits(totalSupplyAfter), "): ✅");
    });

    //
    // Check balance of assets in list
    //
    it("Should has the assets included in the list", async function () {

        for (let index = 0; index < assets.length; index++) {

            let assetBalance = await trading.getAssetBalance(assets[index].address, newContainerAddress);
            assetsBalanceContainer.push(assetBalance);
            
            // This is the asset balance of the Trading contract (for all the containers)
            // let tokenContract = await ethers.getContractAt("TokenERC20", assets[index].address);
            // let balance = await tokenContract.balanceOf(trading.address);
            // assetsBalanceTotal2.push(balance);

            // expect(balance).to.equal(0);
            // console.log("    Check total balance in Trading is zero : ✅");

            // let assetsBalanceDiff = toBN(assetsBalanceTotal2[index]).sub(toBN(assetsBalanceTotal1[index]));

            // expect(assetBalance).to.equal(assetsBalanceDiff);
            expect(assetBalance).to.above(0);
            console.log("    Check container balance in Trading ", formatUnits(assetBalance, assets[index].decimals), assets[index].symbol,": ✅");  
        }
    });

    //
    // investor is going to request a withdrawal
    // When a withdrawal is requested, assets are sold to satisfy the amount in Ethers to be paid to the user
    //
    it("Should sell part of the assets of the contract", async function () {

        // ** Get the ERC20 token balance of investor
        const investorBalanceBefore = await token.balanceOf(investor.address);
        expect(Number(investorBalanceBefore)).to.above(0);
        console.log("    Check the ERC-20 token balance of investor (", formatUnits(investorBalanceBefore), "): ✅");        

        // ** Get the ERC20 token balance of manager
        const managerBalanceBefore = await token.balanceOf(manager.address);
        expect(Number(managerBalanceBefore)).to.above(0);
        console.log("    Check the ERC-20 token balance of manager (", formatUnits(managerBalanceBefore), "): ✅"); 

        // Get token total supply
        const totalSupplyBefore = await token.totalSupply();
        expect(Number(totalSupplyBefore)).to.above(0);
        console.log("    Check ERC-20 token total supply (", formatUnits(totalSupplyBefore), "): ✅");
        
        // ** Define the amount of token to be withdrawn
        // const amountWithdraw = parseInt(Number(investorBalanceBeforeFmt) / 2);
        const amountWithdraw = parseInt(numberFormatUnits(investorBalanceBefore));
        const amountWithdrawToken = ethers.utils.parseUnits(String(amountWithdraw), 18);
        console.log("    Calculate the amount of tokens to be withdrawn (", amountWithdraw, "): ✅");

        // Calculate the Exit fee to be charged
        const exitFeeAmount = (amountWithdrawToken * EXIT_FEE_PCT) / 100;
        console.log("    Calculate the Exit fee (", formatUnits(exitFeeAmount), "): ✅");

        // Calculate the percentage of the total supply of tokens to be sold
        const percentage = ((amountWithdrawToken - exitFeeAmount) * 100) / Number(totalSupplyBefore);
        const sellPct = ethers.utils.parseUnits(String(percentage), 18)
        console.log("    Calculate the percentage of assets to sell (", formatUnits(sellPct), "%): ✅");

        // ** Calculate the amount that will be sold of each of the assets to satisfy the withdrawal
        let amountToSell = [];
        for (let index = 0; index < assets.length; index++) {

            let assetBalance = await trading.getAssetBalance(assets[index].address, newContainerAddress);
            expect(Number(assetBalance)).to.above(0);

            let result = toBN(assetBalance).mul(toBN(sellPct)).div(toBN(100).mul(toBN(PRECISION)));
            amountToSell.push(result);
            console.log("    Expected to sell", formatUnits(result, assets[index].decimals), assets[index].symbol, ": ✅");
        }
        
        // ** Get the ERC20 token balance of owner
        const balanceTokenOwner = await token.balanceOf(owner.address);
        expect(Number(balanceTokenOwner)).to.equal(0);
        console.log("    Check the ERC-20 token balance of owner is zero: ✅");

        await expect(container.connect(owner).withdrawalRequest(amountWithdrawToken))
          .to.be.revertedWith('Container: insufficient balance');
        console.log("    Fail as owner can not request a withdrawal (has balance 0): ✅");

        await expect(container.connect(investor).withdrawalRequest(toBN(amountWithdrawToken).mul(toBN(3))))
          .to.be.revertedWith('Container: insufficient balance');
        console.log("    Fail due to insufficient balance (investor): ✅");

        await expect(container.connect(investor).withdrawalRequest(amountWithdrawToken))
          .to.be.revertedWith('Container:insufficient allowance');        
        console.log("    Fail due to insufficient allowance (investor): ✅");

        // Investor approves allocation of the container so that it can sell its tokens
        await token.connect(investor).approve(newContainerAddress, amountWithdrawToken);
        console.log("    Investor approves ERC-20 token allocation of the container: ✅");

        // ** Request the withdrawal
        await expect(container.connect(investor).withdrawalRequest(amountWithdrawToken))
            .to.emit(container, 'WithdrawalRequested');
        console.log("    Request a withdrawal and emit WithdrawalRequested event: ✅");

        // ** Get the ETH contract balance
        // const containerBalanceEth = await container.getContractBalance();
        const containerBalanceEth = await provider.getBalance(container.address);
        // ** Get the amount pending to withdrawal for investor
        const amountPendingWithdrawal = await container.getPendingWithdrawal(investor.address);
        expect(amountPendingWithdrawal).to.gt(0);
        console.log("    Investor amount pending withdrawal (", formatUnits(amountPendingWithdrawal), "ETH) : ✅");

        expect(containerBalanceEth).to.equal(amountPendingWithdrawal);
        console.log(
          "    Container balance (ETH) is the amount obtained from the sale of assets for withdrawal: ✅"
        );

        // ** checks if the balance of each asset matches the amount that was expected after selling 
        // ** them to satisfy the withdrawal request
        /* Checking the balances of the assets in the Trading contract and in each asset contract. */
        for (let index = 0; index < assets.length; index++) {
          
          let balanceContainer = await trading.getAssetBalance(assets[index].address, newContainerAddress);
          let newBalanceContainer = toBN(assetsBalanceContainer[index]).sub(toBN(amountToSell[index]));

          expect(balanceContainer).to.above(toBN(newBalanceContainer).sub(toBN(Number(MARGIN_CHAR))));
          expect(balanceContainer).to.below(toBN(newBalanceContainer).add(toBN(Number(MARGIN_CHAR))));
          console.log("    Check container asset balance", formatUnits(balanceContainer, assets[index].decimals), assets[index].symbol, ": ✅");          
        }

        // ** Get the ERC20 token balance of investor
        /* Checking the balance of the investor after the withdrawal. */
        const investorBalanceAfter = await token.balanceOf(investor.address);
        const investorBalanceResult = toBN(investorBalanceBefore).sub(toBN(amountWithdrawToken));

        expect(investorBalanceAfter).to.equal(investorBalanceResult);
        console.log("    Check the ERC-20 token balance of investor (", formatUnits(investorBalanceAfter), "): ✅");
        
        // ** Get the ERC20 token balance of manager
        /* Checking the balance of the manager after the exit fee has been paid. */
        const managerBalanceAfter = await token.balanceOf(manager.address);
        const managerBalanceResult = toBN(managerBalanceBefore).add(toBN(String(exitFeeAmount)));

        expect(managerBalanceAfter).to.equal(managerBalanceResult);
        console.log("    Check the ERC-20 token balance of manager (", formatUnits(managerBalanceAfter), "): ✅");

        // ** Get token total supply
        /* Checking the total supply of the ERC-20 token after the withdrawal. */
        const totalSupplyAfter = await token.totalSupply();
        const totalSupplyAfterResult = toBN(totalSupplyBefore)
          .sub(toBN(amountWithdrawToken))
          .add(toBN(String(exitFeeAmount)));
        expect(totalSupplyAfter).to.equal(totalSupplyAfterResult);
        console.log("    Check ERC-20 token total supply (", formatUnits(totalSupplyAfter), "): ✅");
    });

    it("Should complete a withdraw requested", async function () {

        // ** Get the ETH balances before withdraw (investor and container)
        let balanceUserBefore = await provider.getBalance(investor.address);
        console.log("    Investor ETH balance before withdraw  (", formatUnits(balanceUserBefore), "): ✅");
        let balanceContainerBefore = await provider.getBalance(container.address);
        console.log("    Container ETH balance before withdraw (", formatUnits(balanceContainerBefore), "): ✅");
        
        // ** Get the amount pending to withdrawal for investor
        const amountPendingBefore = await container.getPendingWithdrawal(investor.address);
        expect(amountPendingBefore).to.above(0);
        console.log("    ETH amount pending to withdrawal by investor (", formatUnits(amountPendingBefore), "): ✅");

        // ** Get the amount pending to withdrawal for manager
        expect(await container.getPendingWithdrawal(manager.address)).to.equal(0);
        console.log("    ETH amount pending to withdrawal by manager is 0: ✅");

        await expect(container.connect(manager).withdraw())
          .to.be.revertedWith('Container: No amount to withdraw');        
        console.log("    Fail for not having amount to withdraw (manager): ✅");

        // await container.connect(investor).withdraw();
        
        await expect(container.connect(investor).withdraw())
          .to.emit(container, 'WithdrawalSent')
          .withArgs(investor.address, amountPendingBefore);
        console.log("    Withdraw and emit event WithdrawalSent (investor): ✅");
        
        // ** Get the amount pending to withdrawal for investor
        const amountPendingAfter = await container.getPendingWithdrawal(investor.address);
        expect(await container.getPendingWithdrawal(investor.address)).to.equal(0);
        console.log("    ETH amount pending to withdrawal by investor is zero: ✅");

        //  ** Get the ETH balances after withdraw (investor and container)
        let balanceUserAfter = await provider.getBalance(investor.address);

        // console.log("balanceUserBefore      > ", balanceUserBefore);
        // console.log("balanceUserAfter       > ", balanceUserAfter);
        // console.log("                         ----------------------");
        // let result = toBN(balanceUserAfter).sub(toBN(balanceUserBefore));
        // console.log("result                 >    ", result);
        // console.log("amountPendingBefore    >    ", amountPendingBefore);
        // console.log("                         ----------------------");
        // let result2 = toBN(amountPendingBefore).sub(toBN(result));
        // console.log("result2                >        ", result2);
        // let result3 = (Number(result2) * 100) / Number(amountPendingBefore);
        // console.log("                         ----------------------");
        // console.log("result3 %              >        ", result3);
        
        // ** Get the amount pending to withdrawal for investor
        expect(await container.getPendingWithdrawal(investor.address)).to.equal(0);
        console.log("    ETH amount pending to withdrawal by investor is 0: ✅");
        
        // After a transfer, the account does not receive 100% of the withdrawal amount (use a margin of 0,02%)
        let diff = amountPendingBefore.mul(toBN(2)).div(toBN(10000));
             
        expect(balanceUserAfter).to.gte(balanceUserBefore.add(amountPendingBefore).sub(diff));
        console.log("    Investor ETH balance after withdraw  (", formatUnits(balanceUserAfter), "): ✅");
        
        let balanceContainerAfter = await provider.getBalance(container.address);
        expect(balanceContainerAfter).to.equal(balanceContainerBefore.sub(amountPendingBefore));
        console.log("    Container ETH balance after withdraw (", formatUnits(balanceContainerAfter), "): ✅");

    });

    it("Should set a new asset list", async function () {

      assetList2 = [
        ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 25],
        ["0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39", 30],
        ["0x4E15361FD6b4BB609Fa63C81A2be19d873717870", 30],
        ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", 10],
        ["0x6B175474E89094C44Da98b954EedeAC495271d0F", 5]
      ];

      await expect(container.connect(investor).setAssetList(assetList2))
        .to.be.revertedWith('AccessControl: account 0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc is missing role 0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08');   
      console.log("    Fail due to use an user without manager role (investor): ✅");

      await container.connect(manager).setAssetList(assetList2);
      console.log("    Container assets updated: ✅");

    })

    it("Should rebalance the asset list that already exists", async function () {

      assetList3 = [
        ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 38],
        ["0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39", 10],
        ["0x4E15361FD6b4BB609Fa63C81A2be19d873717870", 32],
        ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", 12],
        ["0x6B175474E89094C44Da98b954EedeAC495271d0F", 8]
      ];

      await expect(container.connect(investor).rebalanceAssetList(assetList3))
        .to.be.revertedWith('AccessControl: account 0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc is missing role 0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08');   
      console.log("    Fail due to use an user without manager role (investor): ✅");

      await container.connect(manager).rebalanceAssetList(assetList3);
      console.log("    Container assets rebalanced: ✅");

    })

    it("Should get assets managed by Trading contract", async function () {
      let result = await trading.getAssetsOwned(container.address);
      expect(result.length).to.equal(assetList2.length);
      console.log("    Check number of assets returned (", result.length, ") : ✅");

      for (let index = 0; index < assets.length; index++) {
        let balanceContainer = await trading.getAssetBalance(assets[index].address, newContainerAddress);
        expect(balanceContainer).to.equal(result[index].balance);

        let tokenContract = await ethers.getContractAt("TokenERC20", assets[index].address);
        let balance = await tokenContract.balanceOf(newContainerAddress);
        expect(balanceContainer).to.equal(balance);
        console.log("    Check container asset balance and ERC20 balance", formatUnits(balance, await tokenContract.decimals()), await tokenContract.symbol(), ": ✅");        
      }
    })

    it("Should close a container", async function () {

      expect(await container.isContainerActive()).to.be.true;
      console.log("    Container is active: ✅");

      expect(await container.getContractBalanceReserved()).to.equal(0);
      console.log("    ETH amount reserved for withdrawal requests is zero: ✅");

      await expect(container.connect(investor).closeContainer())
      //  .to.be.revertedWith(/AccessControl: account .* is missing role .*/);   
        .to.be.revertedWith('AccessControl: account 0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc is missing role 0x241ecf16d79d0f8dbfb92cbc07fe17840425976cf0667f022fe9877caa831b08');   
      console.log("    Fail due to use an user without manager role (investor): ✅");

      let result;

      await expect(result = container.connect(manager).closeContainer())
        .to.emit(container, 'ContainerClosed');
      console.log("    Event ContainerClosed is emitted: ✅");

      hash = "";

      result.then((reason, error) => {
        if (reason) {
          hash = reason.hash;
        } else {
          console.error("error >", error);
        }
      });

    })
    
    it("Should be the container closed and with all balances 0 (except ETH)", async function () {

      expect(await container.isContainerActive()).to.be.false;
      console.log("    Container is not active: ✅");

      // ** Get the transaction receipt to obtain the details
      // const receipt = await ethers.provider.getTransactionReceipt(hash);
      // console.log("receipt >", receipt);

      let amountReserved = await container.getContractBalanceReserved();
      expect(amountReserved).to.above(0);
      console.log("    ETH amount reserved for withdrawal requests is", formatUnits(amountReserved), ": ✅");

      let balanceEth = await provider.getBalance(container.address);
      expect(balanceEth).to.gte(amountReserved);
      console.log("    Container balance is", formatUnits(balanceEth), "ETH: ✅");

      let result = await trading.getAssetsOwned(container.address);
      for (let index = 0; index < result.length; index++) {
        expect(result[index].balance).to.equal(0);
        console.log("    Check container asset balance is zero", assets[index].symbol, ": ✅");          
      }
    })

    it("Should request a withdrawal after close the container", async function () {
      
      await expect(container.connect(investor).withdraw())
        .to.be.revertedWith('Container: No amount to withdraw');
      console.log("    Investor tries again to withdraw and fail : ✅");

      await expect(container.connect(investor).withdrawalRequest("1"))
        .to.be.revertedWith('Container: amount too low');
      console.log("    Fail the withdrawal request due to an amount too low: ✅");

      await expect(container.connect(investor).withdrawalRequest(MIN_AMNT_WITHDRAW))
        .to.be.revertedWith('Container: insufficient balance');
      console.log("    Investor tries to request a new withdraw and fail (has balance 0): ✅");
      
      let balanceContainerEthBefore = await provider.getBalance(container.address);
      console.log("    Get the container's ETH balance (", formatUnits(balanceContainerEthBefore), "ETH) : ✅");

      let balanceManagerEthBefore = await provider.getBalance(manager.address);
      console.log("    Get the manager's ETH balance (", formatUnits(balanceManagerEthBefore), "ETH) : ✅");

      let balanceManager = await container.getTokenBalance(manager.address);
      expect(balanceManager).to.be.above(0);
      console.log("    Check manager's ERC20 token balance", formatUnits(balanceManager), ": ✅"); 

      expect(await container.getPendingWithdrawal(investor.address)).to.equal(0);
      console.log("    Check manager's amount pending withdrawal is 0 ETH : ✅");

      await expect(container.connect(manager).withdrawalRequest(balanceManager.add(toBN(1))))
        .to.be.revertedWith('Container: insufficient balance');
      console.log("    Manager tries to request a new withdraw and fail (amount higher than balance): ✅");

      // Manager approves allocation of the container so that it can sell its tokens
      await token.connect(manager).approve(container.address, balanceManager);
      console.log("    Manager approves ERC-20 token allocation of the container: ✅");

      // ** Request the withdrawal
      await expect(container.connect(manager).withdrawalRequest(balanceManager))
        .to.emit(container, 'WithdrawalRequested');
      console.log("    Request a withdrawal correctly: ✅");    

      let amountPendingWithdrawal = await container.getPendingWithdrawal(manager.address);
      expect(amountPendingWithdrawal).to.to.above(0);
      console.log("    Check manager's amount pending withdrawal (", formatUnits(amountPendingWithdrawal), "ETH) : ✅");

      await expect(container.connect(manager).withdraw())
        .to.emit(container, 'WithdrawalSent')
        .withArgs(manager.address, amountPendingWithdrawal);
      console.log("    Manager tries again to withdraw ETHs and it goes well : ✅");

      expect(await container.getPendingWithdrawal(manager.address)).to.equal(0);
      console.log("    Check manager's amount pending withdrawal (0 ETH) : ✅");

      // After a transfer, the account does not receive 100% of the withdrawal amount (use a margin of 0,02%)
      let diff = amountPendingWithdrawal.mul(toBN(2)).div(toBN(10000));

      let balanceManagerEthAfter = await provider.getBalance(manager.address);
      
      // console.log("*** balanceManagerEthBefore > ", balanceManagerEthBefore)
      // console.log("*** balanceManagerEthAfter  >", balanceManagerEthAfter)
      // console.log("                               ----------------------");
      // let result = toBN(balanceManagerEthAfter).sub(toBN(balanceManagerEthBefore));
      // console.log("*** result                  >    ", result);
      // console.log("*** amountPendingWithdrawal >    ", amountPendingWithdrawal)
      // console.log("                               ----------------------");
      // let result2 = toBN(amountPendingWithdrawal).sub(toBN(result));
      // console.log("result2                     >        ", result2);
      // let result3 = (Number(result2) * 100) / Number(amountPendingWithdrawal);
      // console.log("                               ----------------------");
      // console.log("result3 %                   >        ", result3);
      // console.log("*** diff                    >        ", diff)
      
      expect(balanceManagerEthAfter).to.gte(balanceManagerEthBefore.add(amountPendingWithdrawal).sub(diff));
      console.log("    Check the manager ETH balance after the withdrawal  (", formatUnits(balanceManagerEthAfter), "): ✅");      
      
      let balanceContainerEthAfter = await provider.getBalance(container.address);
      expect(balanceContainerEthAfter).to.equal(balanceContainerEthBefore.sub(amountPendingWithdrawal));
      console.log("    Check the container ETH balance after the withdrawal  (", formatUnits(balanceContainerEthAfter), "): ✅");      
    })
});