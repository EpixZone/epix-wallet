module.exports = {
  testEnvironment: "node",
  watchman: false,
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.check.json" }],
  },
  moduleNameMapper: {
    "^@keplr-wallet/common$": "<rootDir>/../common/src",
    "^@keplr-wallet/crypto$": "<rootDir>/../crypto/src",
    "^@keplr-wallet/simple-fetch$": "<rootDir>/../simple-fetch/src",
    "^@keplr-wallet/stores$": "<rootDir>/../stores/src",
    "^@keplr-wallet/types$": "<rootDir>/../types/src",
    "^@keplr-wallet/unit$": "<rootDir>/../unit/src",
  },
  testMatch: ["**/src/**/?(*.)+(spec|test).[jt]s?(x)"],
};
