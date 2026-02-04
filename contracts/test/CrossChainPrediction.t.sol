// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";
import {PredictionMarketSender} from "../src/PredictionMarketSender.sol";
import {Client} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";

contract CrossChainTest is Test {
    PredictionMarket market;
    PredictionMarketSender sender;

    address internal owner = address(0xABCD);
    address internal user = address(0x1234);
    address internal router = address(0x9999); // Mock router
    address internal forwarder = address(0x8888);
    address internal weth = address(0x7777); // Mock WETH

    uint64 internal constant SEPOLIA_SELECTOR = 16015286601757825753;
    uint64 internal constant ARB_SELECTOR = 3478487238524512106;

    function setUp() public {
        vm.startPrank(owner);
        market = new PredictionMarket(forwarder, router, weth);
        sender = new PredictionMarketSender(router, address(market), SEPOLIA_SELECTOR, weth);
        
        // Allowlist sender
        market.allowlistSender(ARB_SELECTOR, address(sender));
        
        // Create market
        market.createMarket("Will ETH reach 10k?");
        vm.stopPrank();
    }

    function testReceiverLogic() public {
        // Prepare data: User predicts YES (0) on Market 0 with 1 ETH
        uint256 amount = 1 ether;
        bytes memory data = abi.encode(user, uint256(0), uint8(0)); 
        
        Client.EVMTokenAmount[] memory tokens = new Client.EVMTokenAmount[](1);
        tokens[0] = Client.EVMTokenAmount({
            token: weth,
            amount: amount
        });
        
        Client.Any2EVMMessage memory message = Client.Any2EVMMessage({
            messageId: bytes32(uint256(1)),
            sourceChainSelector: ARB_SELECTOR,
            sender: abi.encode(address(sender)),
            data: data,
            destTokenAmounts: tokens
        });
        
        // Mock WETH withdraw call
        // When market calls weth.withdraw(amount), it should succeed.
        vm.mockCall(
            weth, 
            abi.encodeWithSignature("withdraw(uint256)", amount), 
            abi.encode()
        );

        // Pre-check
        (uint256 staked,,) = market.getPrediction(0, user);
        assertEq(staked, 0);

        // Simulate Router calling the Market
        vm.prank(router);
        market.ccipReceive(message);
        
        // Check state
        (uint256 newStaked, PredictionMarket.Prediction pred,) = market.getPrediction(0, user);
        assertEq(newStaked, amount);
        assertEq(uint(pred), uint(PredictionMarket.Prediction.Yes));
    }

    function testRevertInvalidSender() public {
        Client.Any2EVMMessage memory message = Client.Any2EVMMessage({
            messageId: bytes32(uint256(1)),
            sourceChainSelector: ARB_SELECTOR,
            sender: abi.encode(address(0xBAD)),
            data: "",
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });

        vm.prank(router);
        vm.expectRevert(abi.encodeWithSelector(PredictionMarket.SenderNotAllowed.selector, address(0xBAD)));
        market.ccipReceive(message);
    }
}
