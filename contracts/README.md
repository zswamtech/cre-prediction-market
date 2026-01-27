# PredictionMarket - CRE Bootcamp Contracts

Smart contracts for the Chainlink CRE Bootcamp Prediction Market.

## Contracts

| Contract | Description |
|----------|-------------|
| `PredictionMarket.sol` | Main prediction market contract |
| `interfaces/IReceiver.sol` | Chainlink CRE receiver interface |
| `interfaces/ReceiverTemplate.sol` | Base contract for receiving CRE reports |

## Quick Commands

```bash
# Build contracts
forge build

# Run tests
forge test

# Deploy to Sepolia (replace with your values)
source ../.env
forge create src/PredictionMarket.sol:PredictionMarket \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --private-key $CRE_ETH_PRIVATE_KEY \
  --broadcast \
  --constructor-args 0x15fc6ae953e024d975e77382eeec56a9101f9f88
```

## Constructor Arguments

- `_forwarderAddress`: Chainlink KeystoneForwarder address
  - Sepolia: `0x15fc6ae953e024d975e77382eeec56a9101f9f88`

## Contract Functions

### Day 1 Functions
- `createMarket(string question)` - Create a new prediction market
- `getMarket(uint256 marketId)` - Get market details

### Day 2 Functions
- `predict(uint256 marketId, Prediction prediction)` - Make a prediction (Yes/No)
- `requestSettlement(uint256 marketId)` - Request AI settlement
- `claim(uint256 marketId)` - Claim winnings after settlement

## Events

```solidity
event MarketCreated(uint256 indexed marketId, string question, address creator);
event PredictionMade(uint256 indexed marketId, address indexed predictor, Prediction prediction, uint256 amount);
event SettlementRequested(uint256 indexed marketId, string question);
event MarketSettled(uint256 indexed marketId, Prediction outcome, uint16 confidence);
event WinningsClaimed(uint256 indexed marketId, address indexed claimer, uint256 amount);
```

## Resources

- [CRE Bootcamp mdBook](https://smartcontractkit.github.io/cre-bootcamp-2026/)
- [Chainlink CRE Docs](https://docs.chain.link/cre)
- [Foundry Book](https://book.getfoundry.sh/)
