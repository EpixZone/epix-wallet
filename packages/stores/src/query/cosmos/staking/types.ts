import { Coin } from "@keplr-wallet/types";
import {
  CoinPrimitive,
  isSuspectedResponseDataWithInvalidValue,
} from "../../../common";
import Joi from "joi";

export type Rewards = {
  rewards?: DelegatorReward[] | null;
  total?: CoinPrimitive[];
};

export type DelegatorReward = {
  validator_address: string;
  reward: CoinPrimitive[] | null;
};

export type Delegations = {
  delegation_responses: Delegation[];
  // pagination: {}
};

export type Delegation = {
  delegation: {
    delegator_address: string;
    validator_address: string;
    // Dec
    shares: string;
  };
  balance: {
    denom: string;
    amount: string;
  };
};

export type InitiaDelegations = {
  delegation_responses: InitiaDelegation[];
};

export type InitiaDelegation = {
  delegation: {
    delegator_address: string;
    validator_address: string;
    shares: Coin[];
  };
  balance: {
    denom: string;
    amount: string;
  }[];
};

export type UnbondingDelegations = {
  unbonding_responses: UnbondingDelegation[];
  // pagination: {}
};

export type UnbondingDelegation = {
  delegator_address: string;
  validator_address: string;
  entries: {
    creation_height: string;
    completion_time: string;
    initial_balance: string;
    balance: string;
  }[];
};

export type InitiaUnbondingDelegations = {
  unbonding_responses: InitiaUnbondingDelegation[];
};

export type InitiaUnbondingDelegation = {
  delegator_address: string;
  validator_address: string;
  entries: {
    creation_height: string;
    completion_time: string;
    initial_balance: Coin[];
    balance: Coin[];
  }[];
};

const validationOptions: Joi.ValidationOptions = {
  convert: false,
};

const IntegerStringSchema = Joi.string()
  .pattern(/^[0-9]+$/)
  .required();
const DecimalStringSchema = Joi.string()
  .pattern(/^[0-9]+(\.[0-9]+)?$/)
  .required();

const CoinPrimitiveSchema = Joi.object<CoinPrimitive>({
  denom: Joi.string().required(),
  amount: IntegerStringSchema,
}).unknown(true);

const RewardCoinSchema = Joi.object<CoinPrimitive>({
  denom: Joi.string().required(),
  amount: DecimalStringSchema,
}).unknown(true);

const DelegationSchema = Joi.object<Delegation>({
  delegation: Joi.object({
    delegator_address: Joi.string().required(),
    validator_address: Joi.string().required(),
    shares: Joi.string().required(),
  })
    .unknown(true)
    .required(),
  balance: Joi.object({
    denom: Joi.string().required(),
    amount: IntegerStringSchema,
  })
    .unknown(true)
    .required(),
}).unknown(true);

const InitiaDelegationSchema = Joi.object<InitiaDelegation>({
  delegation: Joi.object({
    delegator_address: Joi.string().required(),
    validator_address: Joi.string().required(),
    shares: Joi.array().items(RewardCoinSchema).required(),
  })
    .unknown(true)
    .required(),
  balance: Joi.array().items(CoinPrimitiveSchema).required(),
}).unknown(true);

const UnbondingEntrySchema = Joi.object<UnbondingDelegation["entries"][number]>(
  {
    creation_height: Joi.string().required(),
    completion_time: Joi.string().required(),
    initial_balance: IntegerStringSchema,
    balance: IntegerStringSchema,
  }
).unknown(true);

const UnbondingDelegationSchema = Joi.object<UnbondingDelegation>({
  delegator_address: Joi.string().required(),
  validator_address: Joi.string().required(),
  entries: Joi.array().items(UnbondingEntrySchema).required(),
}).unknown(true);

const InitiaUnbondingEntrySchema = Joi.object<
  InitiaUnbondingDelegation["entries"][number]
>({
  creation_height: Joi.string().required(),
  completion_time: Joi.string().required(),
  initial_balance: Joi.array().items(CoinPrimitiveSchema).required(),
  balance: Joi.array().items(CoinPrimitiveSchema).required(),
}).unknown(true);

const InitiaUnbondingDelegationSchema = Joi.object<InitiaUnbondingDelegation>({
  delegator_address: Joi.string().required(),
  validator_address: Joi.string().required(),
  entries: Joi.array().items(InitiaUnbondingEntrySchema).required(),
}).unknown(true);

const DelegatorRewardSchema = Joi.object<DelegatorReward>({
  validator_address: Joi.string().required(),
  reward: Joi.array().items(RewardCoinSchema).allow(null).optional(),
}).unknown(true);

const DelegationsResponseSchema = Joi.object<Delegations>({
  delegation_responses: Joi.array().items(DelegationSchema).required(),
}).unknown(true);

const InitiaDelegationsResponseSchema = Joi.object<InitiaDelegations>({
  delegation_responses: Joi.array().items(InitiaDelegationSchema).required(),
}).unknown(true);

const UnbondingDelegationsResponseSchema = Joi.object<UnbondingDelegations>({
  unbonding_responses: Joi.array().items(UnbondingDelegationSchema).required(),
}).unknown(true);

const InitiaUnbondingDelegationsResponseSchema =
  Joi.object<InitiaUnbondingDelegations>({
    unbonding_responses: Joi.array()
      .items(InitiaUnbondingDelegationSchema)
      .required(),
  }).unknown(true);

const RewardsResponseSchema = Joi.object<Rewards>({
  rewards: Joi.array().items(DelegatorRewardSchema).allow(null).optional(),
  total: Joi.array().items(RewardCoinSchema).optional(),
})
  .or("rewards", "total")
  .unknown(true);

function getValidatedResponse<T>(
  schema: Joi.ObjectSchema<T>,
  data: unknown
): T | undefined {
  const validated = schema.validate(data, validationOptions);
  if (validated.error) {
    return;
  }

  return validated.value;
}

export function assertStakingResponseData(
  headers: any,
  data: unknown,
  assertResponse: (data: unknown) => void
): void {
  if (isSuspectedResponseDataWithInvalidValue(headers, data)) {
    return;
  }

  assertResponse(data);
}

export function getDelegationResponses(
  data: unknown
): Delegation[] | undefined {
  return getValidatedResponse(DelegationsResponseSchema, data)
    ?.delegation_responses;
}

export function assertDelegationsResponse(
  data: unknown
): asserts data is Delegations {
  if (!getDelegationResponses(data)) {
    throw new Error("Invalid Cosmos staking delegations response");
  }
}

export function getInitiaDelegationResponses(
  data: unknown
): InitiaDelegation[] | undefined {
  return getValidatedResponse(InitiaDelegationsResponseSchema, data)
    ?.delegation_responses;
}

export function assertInitiaDelegationsResponse(
  data: unknown
): asserts data is InitiaDelegations {
  if (!getInitiaDelegationResponses(data)) {
    throw new Error("Invalid Initia staking delegations response");
  }
}

export function getUnbondingResponses(
  data: unknown
): UnbondingDelegation[] | undefined {
  return getValidatedResponse(UnbondingDelegationsResponseSchema, data)
    ?.unbonding_responses;
}

export function assertUnbondingDelegationsResponse(
  data: unknown
): asserts data is UnbondingDelegations {
  if (!getUnbondingResponses(data)) {
    throw new Error("Invalid Cosmos staking unbonding delegations response");
  }
}

export function getInitiaUnbondingResponses(
  data: unknown
): InitiaUnbondingDelegation[] | undefined {
  return getValidatedResponse(InitiaUnbondingDelegationsResponseSchema, data)
    ?.unbonding_responses;
}

export function assertInitiaUnbondingDelegationsResponse(
  data: unknown
): asserts data is InitiaUnbondingDelegations {
  if (!getInitiaUnbondingResponses(data)) {
    throw new Error("Invalid Initia staking unbonding delegations response");
  }
}

export function getRewardsResponse(data: unknown): Rewards | undefined {
  return getValidatedResponse(RewardsResponseSchema, data);
}

export function assertRewardsResponse(data: unknown): asserts data is Rewards {
  if (!getRewardsResponse(data)) {
    throw new Error("Invalid Cosmos distribution rewards response");
  }
}

export type Validator = {
  operator_address: string;
  consensus_pubkey: {
    "@type": string;
    // Base64
    key: string;
  };
  jailed: boolean;
  status:
    | "BOND_STATUS_UNSPECIFIED"
    | "BOND_STATUS_UNBONDED"
    | "BOND_STATUS_UNBONDING"
    | "BOND_STATUS_BONDED";
  // Int
  tokens: string;
  // Dec
  delegator_shares: string;
  description: {
    moniker?: string;
    identity?: string;
    website?: string;
    security_contact?: string;
    details?: string;
  };
  unbonding_height: string;
  unbonding_time: string;
  commission: {
    commission_rates: {
      // Dec
      rate: string;
      // Dec
      max_rate: string;
      // Dec
      max_change_rate: string;
    };
    update_time: string;
  };
  // Int
  min_self_delegation: string;
};

export type Validators = {
  validators: Validator[];
  // pagination: {}
};

export type InitiaValidator = Omit<Validator, "tokens" | "delegator_shares"> & {
  voting_power: string;
  tokens: Coin[];
};

export type InitiaValidators = {
  validators: InitiaValidator[];
  // pagination: {}
};

export enum BondStatus {
  Unbonded = "Unbonded",
  Unbonding = "Unbonding",
  Bonded = "Bonded",
  Unspecified = "Unspecified",
}

export type StakingParams = {
  params: {
    unbonding_time: string;
    max_validators: number;
    max_entries: number;
    historical_entries: number;
    bond_denom: string;
  };
};

export type StakingPool = {
  pool: {
    // Int
    not_bonded_tokens: string | { denom: string; amount: string }[];
    // Int
    bonded_tokens: string | { denom: string; amount: string }[];
  };
};

export type BabylonRewardGauges = {
  reward_gauges: {
    BTC_STAKER: {
      coins: {
        denom: string;
        amount: string;
      }[];
      withdrawn_coins: {
        denom: string;
        amount: string;
      }[];
    };
  };
};
